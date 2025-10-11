export function reverseIdentifiers(root) {
  root.find(j.Identifier).forEach((path) => {
    j(path).replaceWith(
      j.identifier(path.node.name.split("").reverse().join("")),
    );
  });
}
