export async function queueEmails<T, U, V>(
  entities: T[],
  referenceEntity: U,
  callback: (
    entity: T,
    referenceEntity: U,
    transactionScope: V,
  ) => Promise<void>,
  transactionScope: V,
) {
  let counter = 0;
  for (let entity of entities) {
    if (counter % 10 === 0) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    await callback(entity, referenceEntity, transactionScope);
    counter++;
  }
}
