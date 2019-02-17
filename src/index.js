const request = require("request");
const progress = require("progress-status");

const { readLine, createQueue } = require("./utils");

const fetchQueue = createQueue(5);

function fetchData(url, params) {
  return new Promise((resolve, reject) => {
    const options = {
      url,
      qs: params.qs,
      headers: {
        Authorization: `token ${params.token}`,
        Accept: "application/vnd.github.v3+json",
        // https://developer.github.com/v3/#user-agent-required
        "User-Agent": "analyze-github-prs"
      }
    };

    async function callback(error, response, body) {
      let data = [];
      if (!error && response && response.statusCode == 200) {
        if (params.first && response.headers.link) {
          // <https://api.github.com/repositories/2997259/pulls?page=2>; rel="next", <https://api.github.com/repositories/2997259/pulls?page=2>; rel="last"
          const links = response.headers.link.split(", ").reduce((acc, str) => {
            const res = str.match(/<(.+?)>; rel="(.+)"/);

            if (res) {
              const [_full, link, key] = res;
              acc[key] = link;
            } else {
              console.log("could not find anything:::", str);
            }
            return acc;
          }, {});

          const linksPromises = [];

          if (links.next && links.last) {
            const res = links.last.match(/page=(\d+?)$/);

            if (res) {
              const [_full, lastPage] = res;

              let finishedPages = 1;
              console.log("Fetching list of pull requests...");
              progress(finishedPages / lastPage);
              for (let i = 2; i <= lastPage; i++) {
                const newParams = {
                  ...params,
                  qs: {
                    ...params.qs,
                    page: i
                  },
                  first: false
                };
                const queuePromise = fetchQueue(() =>
                  fetchData(url, newParams).then(pageData => {
                    data = data.concat(pageData);
                    progress(++finishedPages / lastPage);
                  })
                );

                linksPromises.push(queuePromise);
              }
            } else {
              process.exit(1);
            }
          }

          await Promise.all(linksPromises);
        }
        const info = JSON.parse(body);

        if (data.length) {
          resolve(info.concat(data));
        } else {
          resolve(info);
        }
      } else {
        if (response && response.statusCode === 404) {
          console.log("Server responded with 404 error.");
          console.log(`url called: ${response.url}`);
        } else {
          console.log(response.headers);
          console.log(
            error,
            response && response.statusCode,
            response && response.statusMessage,
            url
          );
        }
        reject(error);
      }
    }

    request(options, callback);
  });
}

async function main() {
  const { TOKEN, AUTHOR, PROJECT } = process.env;
  const token = TOKEN || (await readLine({ text: "Enter your GitHub token:" }));
  const author = AUTHOR || (await readLine({ text: "Enter author/org name:" }));
  const project = PROJECT || (await readLine({ text: "Type project name:" }));
  try {
    const repos = await fetchData(
      `https://api.github.com/repos/${author}/${project}/pulls`,
      {
        first: true,
        token,
        qs: {
          state: "all"
        }
      }
    );

    let additions = 0;
    let deletions = 0;

    let number = 0;

    console.log("Fetching individual pull requests...");
    await Promise.all(
      repos.map(async repo => {
        return fetchQueue(async () => {
          try {
            const data = await fetchData(
              `https://api.github.com/repos/${author}/${project}/pulls/${
                repo.number
              }`,
              {
                token
              }
            );

            additions += data.additions;
            deletions += data.deletions;
          } catch (e) {
            console.log(`error fetching PR #${repo.number}:`, e);
          }

          number++;
          progress(number / repos.length);
        });
      })
    );

    console.log("");
    console.log(
      `average additions per PR: +${(additions / repos.length).toFixed(2)}`
    );
    console.log(
      `average deletions per PR: -${(deletions / repos.length).toFixed(2)}`
    );
    console.log("");
    process.exit(0);
  } catch (e) {
    console.log("error happened:", e);
  }
}

function printPRStats(data) {
  console.log("");
  console.log(`PR named: ${data.title}`);
  console.log(`additions: +${data.additions}`);
  console.log(`deletions: -${data.deletions}`);
  console.log("");
  console.log("==================================");
}

main();
