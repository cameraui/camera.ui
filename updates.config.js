export default {
  exclude: ["typescript", "eslint", "@stylistic/eslint-plugin"],
  cooldown: "7d",
  overrides: [{ include: [/^(@camera\.ui\/|camera\.ui$|node-av$|@seydx\/|camera[-_]ui[-_]|github\.com\/(cameraui|seydx)\/)/], cooldown: 0 }],
};
