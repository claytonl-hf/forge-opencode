import { object, option, message } from "@optique/core";
import { defineCommand } from "@optique/discover/command";

import { context } from "../app";

export default defineCommand({
  path: ["models"],
  metadata: {
    brief: message`List all Forge models.`,
  },
  parser: object({
    json: option("--json", {
      description: message`Output the list of Forge models in JSON format.`,
    }),
  }),
  async handler({ json }) {
    const models = await context.forge!.models();

    if (json) {
      console.log(JSON.stringify(models));
      return;
    }

    for (const model of Object.values(models)) {
      console.group(model.id);
      console.log(`Input: ${model.modalities.input.join(", ")}`);
      console.log(`Output: ${model.modalities.output.join(", ")}`);
      console.log(`Context: ${model.limit?.context}`);
      console.log(`Variants: ${Object.keys(model.variants ?? {}).join(", ")}`);
      console.group("Cost");
      console.log(`Input: ${model.cost?.input}`);
      console.log(`Output: ${model.cost?.output}`);
      console.groupEnd();
      console.groupEnd();
    }
  },
});
