import { operatorProcedure } from "./trpc";
import { getDeploymentInfo } from "../services/deployment-info";

export const miscRouter = {
  getDeploymentInfo: operatorProcedure.query(() => getDeploymentInfo()),
  randomNumber: operatorProcedure.subscription(async function* () {
    while (true) {
      yield { randomNumber: Math.random() };
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }),
};
