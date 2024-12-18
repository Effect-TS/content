/**
 * @since 1.0.0
 */
import * as Arr from "effect/Array"
import { pipe } from "effect/Function"
import * as Option from "effect/Option"
import * as AST from "effect/SchemaAST"
import ts from "typescript"
import type { Document } from "./Document.js"

/**
 * @since 1.0.0
 * @category constructors
 */
export const renderDocument = (
  document: Document.Any,
  options?: ts.PrinterOptions
): string => {
  const declarations: Array<ts.Node> = []
  const go = (ast: AST.AST): Option.Option<ts.TypeNode> => {
    switch (ast._tag) {
      case "Declaration": {
        return Option.gen(function*() {
          const id = ts.factory.createIdentifier(yield* getIdentifier(ast))
          const params = Arr.filterMap(ast.typeParameters, (ast) => go(ast))
          return ts.factory.createTypeReferenceNode(id, params)
        })
      }
      case "Literal": {
        const literal = ast.literal
        switch (typeof literal) {
          case "string": {
            return Option.some(ts.factory.createLiteralTypeNode(
              ts.factory.createStringLiteral(literal)
            ))
          }
          case "number": {
            return Option.some(ts.factory.createLiteralTypeNode(
              ts.factory.createNumericLiteral(literal)
            ))
          }
          case "boolean": {
            return Option.some(ts.factory.createLiteralTypeNode(
              literal ? ts.factory.createTrue() : ts.factory.createFalse()
            ))
          }
          case "bigint": {
            return Option.some(ts.factory.createLiteralTypeNode(
              ts.factory.createBigIntLiteral(literal.toString())
            ))
          }
          default: {
            return Option.some(ts.factory.createLiteralTypeNode(
              ts.factory.createNull()
            ))
          }
        }
      }
      case "UniqueSymbol": {
        return Option.none()
      }
      case "UndefinedKeyword": {
        return Option.some(ts.factory.createKeywordTypeNode(ts.SyntaxKind.UndefinedKeyword))
      }
      case "VoidKeyword": {
        return Option.some(ts.factory.createKeywordTypeNode(ts.SyntaxKind.VoidKeyword))
      }
      case "NeverKeyword": {
        return Option.some(ts.factory.createKeywordTypeNode(ts.SyntaxKind.NeverKeyword))
      }
      case "UnknownKeyword": {
        return Option.some(ts.factory.createKeywordTypeNode(ts.SyntaxKind.UnknownKeyword))
      }
      case "AnyKeyword": {
        return Option.some(ts.factory.createKeywordTypeNode(ts.SyntaxKind.AnyKeyword))
      }
      case "StringKeyword": {
        return Option.some(ts.factory.createKeywordTypeNode(ts.SyntaxKind.StringKeyword))
      }
      case "NumberKeyword": {
        return Option.some(ts.factory.createKeywordTypeNode(ts.SyntaxKind.NumberKeyword))
      }
      case "BooleanKeyword": {
        return Option.some(ts.factory.createKeywordTypeNode(ts.SyntaxKind.BooleanKeyword))
      }
      case "BigIntKeyword": {
        return Option.some(ts.factory.createKeywordTypeNode(ts.SyntaxKind.BigIntKeyword))
      }
      case "SymbolKeyword": {
        return Option.some(ts.factory.createKeywordTypeNode(ts.SyntaxKind.SymbolKeyword))
      }
      case "ObjectKeyword": {
        return Option.some(ts.factory.createKeywordTypeNode(ts.SyntaxKind.ObjectKeyword))
      }
      case "Enums": {
        return Option.gen(function*() {
          const id = ts.factory.createIdentifier(yield* getIdentifier(ast))
          const members = ast.enums.map(([key, value]) =>
            ts.factory.createEnumMember(
              key,
              typeof value === "string"
                ? ts.factory.createStringLiteral(value)
                : ts.factory.createNumericLiteral(value)
            )
          )
          const typeNode = ts.factory.createTypeQueryNode(id)
          const declaration = ts.factory.createEnumDeclaration(
            [ts.factory.createToken(ts.SyntaxKind.ExportKeyword)],
            id,
            members
          )
          declarations.push(declaration)
          return typeNode
        })
      }
      case "TemplateLiteral": {
        const spans: Array<ts.TemplateLiteralTypeSpan> = []
        for (let i = 0; i < ast.spans.length; i++) {
          spans.push(ts.factory.createTemplateLiteralTypeSpan(
            ts.factory.createKeywordTypeNode(ts.SyntaxKind.StringKeyword),
            i < ast.spans.length - 1 ?
              ts.factory.createTemplateMiddle(ast.spans[i].literal) :
              ts.factory.createTemplateTail(ast.spans[i].literal)
          ))
        }
        const node = ts.factory.createTemplateLiteralType(
          ts.factory.createTemplateHead(ast.head),
          spans
        )
        return Option.some(node)
      }
      case "Refinement": {
        return go(ast.from)
      }
      case "TupleType": {
        const elements = pipe(
          ast.elements,
          Arr.filterMap((element) =>
            go(element.type).pipe(
              Option.map((node) =>
                element.isOptional
                  ? ts.factory.createOptionalTypeNode(node)
                  : node
              )
            )
          )
        )
        const isReadonly = ast.isReadonly
        // eslint-disable-next-line no-inner-declarations
        function makeTuple(elements: ReadonlyArray<ts.TypeNode>): ts.TypeNode {
          const tuple = ts.factory.createTupleTypeNode(elements)
          return isReadonly
            ? ts.factory.createTypeOperatorNode(
              ts.SyntaxKind.ReadonlyKeyword,
              tuple
            )
            : tuple
        }
        if (ast.rest.length > 0) {
          const isArray = Arr.isEmptyReadonlyArray(ast.elements)
            && ast.rest.length === 1
          if (isArray) {
            return Option.gen(function*() {
              const node = yield* go(ast.rest[0].type)
              const typeNode = ts.factory.createArrayTypeNode(node)
              return isReadonly
                ? ts.factory.createTypeOperatorNode(
                  ts.SyntaxKind.ReadonlyKeyword,
                  typeNode
                )
                : typeNode
            })
          } else {
            Option.gen(function*() {
              const head = ts.factory.createRestTypeNode(
                ts.factory.createArrayTypeNode(yield* go(ast.rest[0].type))
              )
              const tail = pipe(
                ast.rest.slice(1),
                Arr.filterMap((element) => go(element.type))
              )
              return makeTuple([...elements, head, ...tail])
            })
          }
        }
        return Option.some(makeTuple(elements))
      }
      case "TypeLiteral": {
        const propertySignatures = pipe(
          ast.propertySignatures,
          Arr.filterMap((signature) =>
            go(signature.type).pipe(
              Option.map((node) => {
                const modifiers = signature.isReadonly
                  ? [ts.factory.createModifier(ts.SyntaxKind.ReadonlyKeyword)]
                  : undefined
                const questionToken = signature.isOptional
                  ? ts.factory.createToken(ts.SyntaxKind.QuestionToken)
                  : undefined
                return addDocumentation(signature)(
                  ts.factory.createPropertySignature(
                    modifiers,
                    getPropertyName(signature),
                    questionToken,
                    node
                  )
                )
              })
            )
          )
        )
        const indexSignatures = pipe(
          ast.indexSignatures,
          Arr.filterMap((signature) =>
            Option.gen(function*() {
              const parameterNode = yield* go(signature.parameter)
              const typeNode = yield* go(signature.type)
              const modifiers = signature.isReadonly
                ? [ts.factory.createModifier(ts.SyntaxKind.ReadonlyKeyword)]
                : undefined
              const parameter = ts.factory.createParameterDeclaration(
                undefined,
                undefined,
                "x",
                undefined,
                parameterNode
              )
              return ts.factory.createIndexSignature(modifiers, [parameter], typeNode)
            })
          )
        )
        return Option.some(ts.factory.createTypeLiteralNode([...propertySignatures, ...indexSignatures]))
      }
      case "Union": {
        const members = Arr.filterMap(ast.types, (ast) => go(ast))
        return Option.some(ts.factory.createUnionTypeNode(members))
      }
      case "Suspend": {
        return go(ast.f())
      }
      case "Transformation": {
        return go(ast.from)
      }
    }
  }
  const typeNode = Option.getOrThrow(go(document.fields.ast))
  const documentType = ts.factory.createTypeAliasDeclaration(
    [ts.factory.createToken(ts.SyntaxKind.ExportKeyword)],
    ts.factory.createIdentifier(document.name),
    undefined,
    typeNode
  )
  if (Option.isSome(document.description)) {
    addJsDocComment(documentType, document.description.value)
  }
  return pipe(
    declarations,
    Arr.map((node) => printNode(node, options)),
    Arr.append(printNode(documentType, options)),
    Arr.join("\n\n")
  )
}

const getIdentifier = AST.getAnnotation<AST.IdentifierAnnotation>(
  AST.IdentifierAnnotationId
)

const getDocumentation = AST.getAnnotation<AST.DocumentationAnnotation>(
  AST.DocumentationAnnotationId
)

const getPropertyName = (ast: AST.PropertySignature): ts.PropertyName =>
  typeof ast.name === "symbol" ?
    ts.factory.createComputedPropertyName(createSymbol(ast.name.description)) :
    ts.factory.createIdentifier(String(ast.name))

const createSymbol = (description: string | undefined) =>
  ts.factory.createCallExpression(
    ts.factory.createPropertyAccessExpression(
      ts.factory.createIdentifier("Symbol"),
      "for"
    ),
    [],
    description === undefined ? [] : [ts.factory.createStringLiteral(description)]
  )

const addDocumentation = (annotated: AST.Annotated) => <N extends ts.Node>(node: N): N => {
  const documentation = getDocumentation(annotated)
  if (Option.isSome(documentation)) {
    addJsDocComment(node, documentation.value)
  }
  return node
}

const addJsDocComment = (node: ts.Node, documentation: string): void => {
  ts.addSyntheticLeadingComment(
    node,
    ts.SyntaxKind.MultiLineCommentTrivia,
    `* ${documentation} `,
    true
  )
}

const printNode = (node: ts.Node, printerOptions?: ts.PrinterOptions): string => {
  const sourceFile = ts.createSourceFile(
    "print.ts",
    "",
    ts.ScriptTarget.Latest,
    false,
    ts.ScriptKind.TS
  )
  const printer = ts.createPrinter(printerOptions)
  return printer.printNode(ts.EmitHint.Unspecified, node, sourceFile)
}
