module.exports.readLine = readLine;
module.exports.createQueue = createQueue;

function readLine({ text }) {
  if (text) {
    console.log(text);
  }
  return new Promise(resolve => {
    process.stdout.write("> ");
    process.stdin.on("data", chunk => {
      const input = chunk.toString();
      resolve(input.replace("\n", ""));
    });
  });
}

function createQueue(limit = 10) {
  let running = 0;
  const queue = [];
  const executeFn = fn => {
    if (running === limit) {
      return new Promise(resolve => {
        queue.push({ fn, resolve });
      });
    } else {
      running++;
      const promise = fn();

      promise.then(async () => {
        running--;

        if (queue.length !== 0) {
          const { fn: fnFromQueue, resolve } = queue.shift();
          const result = await executeFn(fnFromQueue);
          resolve(result);
        }
      });

      return promise;
    }
  };

  return executeFn;
}
