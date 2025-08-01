import { Runnable, RunnableConfig, RunnableLambda, RunnableBranch } from "@langchain/core/runnables";

export async function getSummaryWithCachingChain(
  summaryChain: Runnable<any, string, RunnableConfig>,
  summariesDb: PouchDB.Database<SummaryRecord>,
  summaryKey: string,
  symbol: string
) {
  const summaryWithCacheChain = summaryChain.pipe(
    RunnableLambda.from((summary: string) => {
      summariesDb
        .put({
          _id: summaryKey,
          summary: summary,
          symbol: symbol,
          createdAt: new Date(),
        })
        .catch(async function (err) {
          if (err.name === "conflict") {
            summariesDb.put({
              _id: summaryKey,
              _rev: (await summariesDb.get(summaryKey))._rev,
              summary: summary,
              symbol: symbol,
              createdAt: new Date(),
            });
          } else {
            console.log(`Failed to put cached summary for ${symbol}`);
            throw err;
          }
        });
      return summary;
    })
  );
  const cachedSummary = await summariesDb
    .get(summaryKey)
    .then((record) => record.summary)
    .catch((err) => {
      if (err.status !== 404) {
        console.log(`Failed to get cached summary for ${symbol}: ${err}`);
      }
      return null;
    });
  const summaryFromCacheOrLLMChain = RunnableBranch.from([
    [
      (_) => !!cachedSummary,
      RunnableLambda.from((_) => {
        // console.log(`Using cached summary for ${symbol}`);
        return cachedSummary!;
      }),
    ],
    summaryWithCacheChain,
  ]);
  return summaryFromCacheOrLLMChain;
}
export interface SummaryRecord {
  _id: string;
  symbol: string;
  summary: string;
  createdAt: Date;
}
