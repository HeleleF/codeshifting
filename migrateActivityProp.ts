import type {
  API,
  ASTPath,
  ArrowFunctionExpression,
  BlockStatement,
  FileInfo,
  FunctionDeclaration,
  MemberExpression,
  VariableDeclarator,
  ObjectProperty,
  RestElement,
  ObjectPattern,
  TSNonNullExpression,
  CallExpression,
  ImportDeclaration,
} from "jscodeshift";

const REMOVED_PROP_NAME = "activity";
const NEW_PROP_NAME = "activityId";
const SELECTED_VAR_NAME = "selectedActivity";

// BUGS

// bei normal: 2mal ausführen erzeugt ein extra selector call
// bei spreading von props: -> activity.lock wird zu activityId

export default function transformer(file: FileInfo, { jscodeshift }: API) {
  const j = jscodeshift.withParser("tsx");

  const root = j(file.source);

  let wasChanged = false;
  let needImportUpdate = false;

  root
    .find(j.FunctionDeclaration)
    .filter(isReactFC)
    .forEach((path) => {
      wasChanged = migrate(path) || wasChanged;
    });
  root
    .find(j.ArrowFunctionExpression)
    .filter(isReactFC)
    .forEach((path) => {
      wasChanged = migrate(path) || wasChanged;
    });

  if (needImportUpdate) {
    updateImports();
  }

  return wasChanged ? root.toSource() : file.source;

  function isReactFC(
    path: ASTPath<FunctionDeclaration | ArrowFunctionExpression>
  ): boolean {
    const returnStatements = j(path).find(j.ReturnStatement);

    return (
      path.value.params.length === 1 &&
      j.BlockStatement.check(path.node.body) &&
      returnStatements.some(
        (rs) =>
          j.JSXElement.check(rs.node.argument) ||
          j.JSXFragment.check(rs.node.argument)
      )
    );
  }

  function createMemberExpressionCheck([lastProp, ...rest]: (
    | string
    | null
  )[]): (me: MemberExpression) => boolean {
    return (me) => {
      const propertyIdentifierMatches =
        j.Identifier.check(me.property) &&
        (lastProp === null ||
          (!!me.property.loc && me.property.name === lastProp));

      const objectIdentifierMatches =
        j.Identifier.check(me.object) &&
        (rest[0] === null || (!!me.object.loc && me.object.name === rest[0]));

      return propertyIdentifierMatches && rest.length > 1
        ? j.MemberExpression.check(me.object) &&
            createMemberExpressionCheck(rest)(me.object)
        : objectIdentifierMatches;
    };
  }

  function createCallExpression(
    callExpressionArg: CallExpression["arguments"][number]
  ): TSNonNullExpression {
    needImportUpdate = true;

    return j.tsNonNullExpression(
      j.callExpression(j.identifier("useSelector"), [
        j.callExpression(
          j.memberExpression(
            j.identifier("ActivitySelectors"),
            j.identifier("activityById")
          ),
          [callExpressionArg]
        ),
      ])
    );
  }

  function addToFile(...elements: unknown[]): void {
    root.get().node.program.body.unshift(...elements);
  }

  function reduxImport(): ImportDeclaration {
    return j.importDeclaration(
      [j.importSpecifier(j.identifier("useSelector"))],
      j.literal("react-redux")
    );
  }

  function clientImport(): ImportDeclaration {
    return j.importDeclaration(
      [j.importSpecifier(j.identifier("ActivitySelectors"))],
      j.literal("@client-core/lib/activity")
    );
  }

  function updateImports(): void {
    const importsDeclarations = root.find(j.ImportDeclaration);
    if (importsDeclarations.length === 0) {
      addToFile(reduxImport(), clientImport());
      return;
    }

    const reduxImports = importsDeclarations.filter(
      (d) => d.node.source.value === "react-redux"
    );
    if (reduxImports.length > 0) {
      const d = reduxImports.paths()[0];

      if (!d.node.specifiers?.some((s) => s.local?.name === "useSelector")) {
        d.node.specifiers = [
          ...(d.node.specifiers ?? []),
          reduxImport().specifiers![0],
        ];
      }
    } else {
      addToFile(reduxImport());
    }

    const clientImports = importsDeclarations.filter(
      (d) => d.node.source.value === "@client-core/lib/activity"
    );
    if (clientImports.length > 0) {
      const d = clientImports.paths()[0];

      if (
        !d.node.specifiers?.some((s) => s.local?.name === "ActivitySelectors")
      ) {
        d.node.specifiers = [
          ...(d.node.specifiers ?? []),
          clientImport().specifiers![0],
        ];
      }
    } else {
      addToFile(clientImport());
    }

    // wenn noch kein von activity, add einen mit ActivitySelectors
    // wenn noch kein von redux, add einen mit useSelector
  }

  function migrateIdentifier(
    path: ASTPath<FunctionDeclaration | ArrowFunctionExpression>,
    propsName: string
  ): boolean {
    let changed = false;

    const idExpressions = j(path).find(
      j.MemberExpression,
      createMemberExpressionCheck(["id", REMOVED_PROP_NAME, propsName])
    );
    if (idExpressions.length > 0) {
      idExpressions.forEach((me) => {
        me.replace(
          j.memberExpression(
            j.identifier(propsName),
            j.identifier(NEW_PROP_NAME)
          )
        );
      });

      changed = true;
    }

    const varExpressions = j(path).find(
      j.VariableDeclaration,
      (v) =>
        v.kind === "const" &&
        j.VariableDeclarator.check(v.declarations[0]) &&
        j.MemberExpression.check(v.declarations[0].init) &&
        createMemberExpressionCheck([REMOVED_PROP_NAME, propsName])(
          v.declarations[0].init
        )
    );
    if (varExpressions.length > 0) {
      varExpressions.forEach((varDecl) => {
        (varDecl.value.declarations[0] as VariableDeclarator).init =
          createCallExpression(
            j.memberExpression(
              j.identifier(propsName),
              j.identifier(NEW_PROP_NAME)
            )
          );
      });

      changed = true;
    }

    const expressions = j(path).find(
      j.MemberExpression,
      createMemberExpressionCheck([REMOVED_PROP_NAME, propsName])
    );

    if (expressions.length > 0) {
      const newConst = j.variableDeclaration("const", [
        j.variableDeclarator(
          j.identifier(SELECTED_VAR_NAME),
          createCallExpression(
            j.memberExpression(
              j.identifier(propsName),
              j.identifier(NEW_PROP_NAME)
            )
          )
        ),
      ]);

      (path.node.body as BlockStatement).body.unshift(newConst);

      expressions.forEach((me) => {
        me.replace(j.identifier(SELECTED_VAR_NAME));
      });

      changed = true;
    }

    return changed;
  }

  function migrateObjectPattern(
    path: ASTPath<FunctionDeclaration | ArrowFunctionExpression>,
    properties: ObjectPattern["properties"]
  ): boolean {
    const restElement = properties.find((p): p is RestElement =>
      j.RestElement.check(p)
    );

    if (
      restElement &&
      (properties.length === 1 ||
        properties
          .slice(0, -1)
          .every(
            (p) =>
              j.ObjectProperty.check(p) &&
              j.Identifier.check(p.key) &&
              p.key.name !== REMOVED_PROP_NAME
          ))
    ) {
      const restArg = restElement.argument;

      return j.Identifier.check(restArg)
        ? migrateIdentifier(path, restArg.name)
        : false;
    }

    const idx = properties.findIndex(
      (p) =>
        j.ObjectProperty.check(p) &&
        j.Identifier.check(p.key) &&
        p.key.name === REMOVED_PROP_NAME
    );

    if (idx < 0) {
      return false;
    }

    const [activityProp] = properties.splice(
      idx,
      1,
      j.objectProperty.from({
        key: j.identifier(NEW_PROP_NAME),
        value: j.identifier(NEW_PROP_NAME),
        shorthand: true,
      })
    ) as [ObjectProperty];

    switch (true) {
      case j.Identifier.check(activityProp.value): {
        let changed = false;

        const actualName = activityProp.value.name;

        const idExpressions = j(path).find(
          j.MemberExpression,
          createMemberExpressionCheck(["id", actualName])
        );
        if (idExpressions.length > 0) {
          idExpressions.forEach((me) => {
            me.replace(j.identifier(NEW_PROP_NAME));
          });

          changed = true;
        }

        const expressions = j(path).find(
          j.MemberExpression,
          createMemberExpressionCheck([null, actualName])
        );
        if (expressions.length > 0) {
          const newConst = j.variableDeclaration("const", [
            j.variableDeclarator(
              j.identifier(actualName),
              createCallExpression(j.identifier(NEW_PROP_NAME))
            ),
          ]);

          (path.node.body as BlockStatement).body.unshift(newConst);

          changed = true;
        }

        return changed;
      }

      case j.ObjectPattern.check(activityProp.value): {
        const newConst = j.variableDeclaration("const", [
          j.variableDeclarator(
            activityProp.value,
            createCallExpression(j.identifier(NEW_PROP_NAME))
          ),
        ]);

        (path.node.body as BlockStatement).body.unshift(newConst);
        return true;
      }

      default:
        return false;
    }
  }

  function migrate(
    path: ASTPath<FunctionDeclaration | ArrowFunctionExpression>
  ): boolean {
    const propsParam = path.value.params[0];

    switch (true) {
      case j.Identifier.check(propsParam): {
        return migrateIdentifier(path, propsParam.name);
      }

      case j.ObjectPattern.check(propsParam): {
        return migrateObjectPattern(path, propsParam.properties);
      }

      default:
        return false;
    }
  }
}
