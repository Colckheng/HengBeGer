export const createSerialTaskQueue = () => {
  let tail = Promise.resolve();

  return (task) => {
    const nextTask = tail.then(() => task());
    tail = nextTask.catch(() => undefined);
    return nextTask;
  };
};

export default createSerialTaskQueue;
