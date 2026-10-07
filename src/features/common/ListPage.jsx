import { useSearchParams } from 'react-router'
import { Card } from '@/components/ui/Card'
import { DataTable, Pagination } from '@/components/ui/DataTable'
import { FilterBar } from '@/components/ui/Display'
import { SearchInput } from '@/components/ui/SearchInput'

/**
 * Standard list screen: filters + server-paged table + pagination.
 * `state`/`update` come from useSearchState; `query` from usePagedQuery.
 */
export function ListPage({
  state,
  update,
  reset,
  query,
  columns,
  onRowClick,
  searchPlaceholder = 'Search…',
  filters,
  trailing,
  empty,
  rowKey,
  defaultSort,
  footer,
  hideSearch = false,
  compact,
}) {
  const [params] = useSearchParams()
  const hasFilters = [...params.keys()].some((k) => !['page', 'size', 'sort', 'tab'].includes(k))
  const data = query.data
  return (
    <Card>
      <FilterBar onReset={reset} hasFilters={hasFilters} trailing={trailing}>
        {!hideSearch ? (
          <SearchInput
            value={state.q ?? ''}
            onChange={(q) => update({ q })}
            placeholder={searchPlaceholder}
            sx={{ width: { xs: '100%', sm: 256 } }}
          />
        ) : null}
        {filters}
      </FilterBar>
      <DataTable
        columns={columns}
        rows={data?.content ?? []}
        rowKey={rowKey}
        isLoading={query.isLoading}
        error={query.isError ? query.error : null}
        onRetry={query.refetch}
        sort={state.sort ?? defaultSort}
        onSortChange={(sort) => update({ sort })}
        onRowClick={onRowClick}
        empty={empty}
        footer={footer}
        compact={compact}
      />
      {data ? (
        <Pagination
          page={data.page}
          size={data.size}
          totalElements={data.totalElements}
          totalPages={data.totalPages}
          onPageChange={(page) => update({ page })}
          onSizeChange={(size) => update({ size, page: 0 })}
        />
      ) : null}
    </Card>
  )
}
