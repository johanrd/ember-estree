import { describe, it, expect } from "vitest";
import { z } from "zmod";
import { emberParser } from "./parser.js";

/**
 * Example: Migrating a component API from yielded contextual components
 * to named blocks, using zmod with the ember-estree parser adapter.
 *
 * Before:
 *   <Input as |foo|>
 *     <foo.Label @text="hello" />
 *     <foo.Field />
 *     <foo.Error as |error|>
 *        <pre>{{error}}</pre>
 *     </foo.Error>
 *   </Input>
 *
 * After:
 *   <Input>
 *     <:field as |label|>
 *       <label>hello</label>
 *     </:field>
 *     <:error as |error|>
 *       <pre>{{error}}</pre>
 *     </:error>
 *   </Input>
 *
 * This is a common migration pattern in Ember apps when a design-system
 * component switches from yielded contextual components to named blocks.
 */

const INPUT_SOURCE = `import { Input } from 'my-design-system';

export const Foo = <template>
  <Input as |foo|>
    <foo.Label @text="hello" />
    <foo.Field />
    <foo.Error as |error|>
       <pre>{{error}}</pre>
    </foo.Error>
  </Input>
</template>
`;

const EXPECTED_OUTPUT = `import { Input } from 'my-design-system';

export const Foo = <template>
  <Input>
    <:field as |label|>
      <label>hello</label>
    </:field>
    <:error as |error|>
      <pre>{{error}}</pre>
    </:error>
  </Input>
</template>
`;

/**
 * Migrate an <Input> element from contextual components to named blocks.
 *
 * Given a zmod NodePath for an ElementNode with block params (e.g.
 * `<Input as |foo|>`), this function:
 * 1. Reads the yielded prefix from blockParams
 * 2. Maps `<foo.Label>` + `<foo.Field>` → `<:field>` named block
 * 3. Maps `<foo.Error>` → `<:error>` named block (preserving children)
 * 4. Returns the replacement string for zmod's span-based patching
 */
function migrateInputToNamedBlocks(path, source) {
  const node = path.node;

  if (!node.blockParams || node.blockParams.length === 0) {
    return null; // nothing to migrate
  }

  const yieldedPrefix = node.blockParams[0]; // "foo"
  let labelText = "";
  let newParts = [];

  for (const child of node.children) {
    if (child.type === "TextNode" && child.chars.trim() === "") continue;
    if (child.type !== "ElementNode" || !child.tag.startsWith(yieldedPrefix + ".")) continue;

    const subName = child.tag.slice(yieldedPrefix.length + 1);

    if (subName === "Label") {
      // Extract @text attribute value for combining with Field
      const textAttr = child.attributes.find((a) => a.name === "@text");
      labelText = textAttr?.value?.chars ?? "";
    } else if (subName === "Field") {
      // Combine Label text + Field into a <:field> named block
      newParts.push(`<:field as |label|>\n      <label>${labelText}</label>\n    </:field>`);
    } else if (subName === "Error") {
      // Preserve inner content from the original source using spans
      const innerStart = child.children[0]?.start;
      const innerEnd = child.children[child.children.length - 1]?.end;
      const innerContent =
        innerStart != null && innerEnd != null ? source.substring(innerStart, innerEnd).trim() : "";
      const blockParams = child.blockParams.length ? ` as |${child.blockParams.join(" ")}|` : "";
      newParts.push(`<:error${blockParams}>\n      ${innerContent}\n    </:error>`);
    }
  }

  return `<Input>\n    ${newParts.join("\n    ")}\n  </Input>`;
}

describe("Component migration: contextual components → named blocks (zmod)", () => {
  it("finds the <Input> component with block params via zmod find()", () => {
    const j = z.withParser(emberParser);
    const root = j(INPUT_SOURCE);

    const inputElements = root.find("ElementNode", { tag: "Input" });
    expect(inputElements.length).toBe(1);

    inputElements.forEach((path) => {
      expect(path.node.blockParams).toEqual(["foo"]);
    });
  });

  it("finds all yielded child elements", () => {
    const j = z.withParser(emberParser);
    const root = j(INPUT_SOURCE);

    // Query each sub-component by tag prefix
    expect(root.find("ElementNode", { tag: "foo.Label" }).length).toBe(1);
    expect(root.find("ElementNode", { tag: "foo.Field" }).length).toBe(1);
    expect(root.find("ElementNode", { tag: "foo.Error" }).length).toBe(1);
  });

  it("migrates <Input> to named blocks via replaceWith()", () => {
    const j = z.withParser(emberParser);
    const root = j(INPUT_SOURCE);

    root.find("ElementNode", { tag: "Input" }).replaceWith((path) => {
      return migrateInputToNamedBlocks(path, INPUT_SOURCE);
    });

    const output = root.toSource();

    // Verify the output matches the expected migration
    expect(output).toBe(EXPECTED_OUTPUT);
  });

  it("works as a reusable zmod transform", () => {
    // This shows the zmod Transform pattern from the README
    const transform = ({ source }, { z: j }) => {
      const root = j(source);

      root.find("ElementNode", { tag: "Input" }).replaceWith((path) => {
        return migrateInputToNamedBlocks(path, source);
      });

      return root.toSource();
    };

    const j = z.withParser(emberParser);
    const result = transform({ source: INPUT_SOURCE, path: "test.gjs" }, { z: j });

    expect(result).toBe(EXPECTED_OUTPUT);
  });
});
