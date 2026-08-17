import { createForge } from "../src";

const forge = await createForge();

console.group("Handshake");
console.log(`→ Path: ${forge.path}`);
console.log(`→ URI: ${forge.uri}`);
console.log(`→ Token: ${forge.token}`);
console.groupEnd();

const env = await forge.env();

console.group("Environment");
for (const [key, value] of Object.entries(env.env)) {
  console.log(`→ ${key}: ${value}`);
}
console.groupEnd();

await forge.opencode().then((oc) => {
  console.group("OpenCode");
  console.log(`→ Agents: ${oc.directories.agents}`);
  console.log(`→ Commands: ${oc.directories.commands}`);
  console.log(`→ Plugins: ${oc.directories.plugins}`);
  console.log(`→ Themes: ${oc.directories.themes}`);
  console.groupEnd();
});

const agents = await forge.agents();

console.group("Agents");
for (const [name, agent] of Object.entries(agents)) {
  console.log(`→ ${name}: ${agent?.model} / ${agent?.variant || "default"}`);
}
console.groupEnd();

const provider = await forge.provider();

console.group("Provider");
console.log(`→ Endpoint: ${provider?.api.endpoint}`);
console.log(`→ Token: ${provider?.api.key}`);
console.groupEnd();

console.group("Models");
for (const [id, model] of Object.entries(provider?.models ?? {})) {
  console.group(`${model.name}`);
  console.log(`→ ID: ${model.id || id}`);
  console.log(`→ Context: ${model.limit?.context}`);
  if (Array.isArray(model.modalities?.input)) {
    console.log(`→ Input: ${model.modalities.input.join(", ")}`);
  }
  if (Array.isArray(model.modalities?.output)) {
    console.log(`→ Output: ${model.modalities.output.join(", ")}`);
  }
  console.groupEnd();
}

console.groupEnd();
