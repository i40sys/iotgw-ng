import { t } from "./trpc";

export const miscRouter = {
  randomNumber: t.procedure.subscription(async function* () {
    while (true) {
      yield { randomNumber: Math.random() };
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }),
};
