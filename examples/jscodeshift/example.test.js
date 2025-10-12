import { it, expect } from "vitest";

import { transform, reverseIdentifiers } from "./helpers.js";

it("js works", () => {
  let code = transform(`const xy = 2;`, reverseIdentifiers);

  expect(code).toMatchInlineSnapshot(`"const yx = 2;"`);
});

it("<template> works", () => {
  let code = transform(
    `const xy = <template>hi there</template>;`,
    reverseIdentifiers,
  );

  expect(code).toMatchInlineSnapshot(`"const yx = 2;"`);
});
