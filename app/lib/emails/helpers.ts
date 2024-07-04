import { DrizzleTransactionScope } from "@/db/drizzleTransactionScope";

export type QueueEmailCallbackOptions<U> = {
  referenceEntity?: U;
  transactionScope?: DrizzleTransactionScope;
};

export async function queueEmails<T, U>(
  entities: T[],
  callback: (
    entity: T,
    options?: QueueEmailCallbackOptions<U>,
  ) => Promise<void>,
  callbackOptions?: QueueEmailCallbackOptions<U>,
) {
  let counter = 0;
  for (let entity of entities) {
    if (counter % 10 === 0) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    await callback(entity, callbackOptions);
    counter++;
  }
}
