import type { NearTrendPool } from '@workspace/api-client-react';

type PoolData = { pools: NearTrendPool[]; source: string; updatedAt: string; page?: number };
type PoolQuery = {
  data?: PoolData;
  isPending: boolean;
  isError: boolean;
  isFetching: boolean;
};

/** Keep feed data out of search states, including while a new term is debouncing. */
export function selectNearPoolState(search: string, debouncedSearch: string, trends: PoolQuery, results: PoolQuery, searchPage = 1) {
  const term = search.trim();
  const searching = term.length > 0;
  const readyToSearch = term.length >= 2;
  const searchReady = readyToSearch && debouncedSearch === term;
  const pageMatches = results.data?.page === undefined || results.data.page === searchPage;
  const activeData = searching ? searchReady && pageMatches ? results.data : undefined : trends.data;
  const isPending = searching ? readyToSearch && (!searchReady || results.isPending || (!pageMatches && !results.isError)) : trends.isPending;
  const isError = searching ? searchReady && results.isError : trends.isError;
  const isFetching = searching ? results.isFetching : trends.isFetching;
  const state = searching && !readyToSearch ? 'short'
    : isPending ? 'loading'
    : isError ? 'error'
    : !activeData?.pools.length ? 'empty'
    : 'list';
  return { searching, readyToSearch, searchReady, activeData, isPending, isFetching, state };
}