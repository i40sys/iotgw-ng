import { operatorProcedure } from "./trpc";

export const miscRouter = {
  randomNumber: operatorProcedure.subscription(async function* () {
    while (true) {
      yield { randomNumber: Math.random() };
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }),
};
