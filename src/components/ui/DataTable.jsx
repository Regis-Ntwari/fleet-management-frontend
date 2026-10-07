import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableFooter from '@mui/material/TableFooter'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import TableSortLabel from '@mui/material/TableSortLabel'
import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import FirstPageIcon from '@mui/icons-material/FirstPage'
import LastPageIcon from '@mui/icons-material/LastPage'
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft'
import ChevronRightIcon from '@mui/icons-material/ChevronRight'
import { formatNumber } from '@/utils/format'
import { EmptyState, ErrorState, Skeleton } from './Feedback'
import { IconButton } from './Button'
import { Select } from './Field'

const hideBelow = (bp) => (bp ? { display: { xs: 'none', [bp]: 'table-cell' } } : null)
const toArray = (sx) => (Array.isArray(sx) ? sx : sx ? [sx] : [])

/**
 * Server-driven table. `columns`: [{ key, header, render?, sortKey?, align?, width?, sx?, headerSx?, hideBelow? }]
 * Sorting/paging are controlled by the caller (kept in the URL via useSearchState).
 */
export function DataTable({
  columns,
  rows,
  rowKey = (r) => r.id,
  isLoading,
  error,
  onRetry,
  sort,
  onSortChange,
  onRowClick,
  empty,
  skeletonRows = 8,
  sx,
  compact = false,
  stickyHeader = true,
  footer,
}) {
  const [sortField, sortDir] = (sort ?? '').split(',')

  const toggleSort = (key) => {
    if (!onSortChange) return
    if (sortField !== key) onSortChange(`${key},asc`)
    else if (sortDir === 'asc') onSortChange(`${key},desc`)
    else onSortChange(undefined)
  }

  const visible = columns.filter(Boolean)

  return (
    <TableContainer className="scrollbar-thin" sx={[{ width: '100%' }, ...toArray(sx)]}>
      <Table stickyHeader={stickyHeader} size="small" sx={compact ? { '& td': { py: 0.75 } } : undefined}>
        <TableHead>
          <TableRow>
            {visible.map((col) => {
              const sortable = Boolean(col.sortKey && onSortChange)
              const active = sortable && sortField === col.sortKey
              return (
                <TableCell
                  key={col.key}
                  align={col.align === 'right' ? 'right' : 'left'}
                  style={{ width: col.width }}
                  sx={[hideBelow(col.hideBelow), ...toArray(col.headerSx)]}
                  sortDirection={active ? sortDir : false}
                >
                  {sortable ? (
                    <TableSortLabel active={active} direction={active ? sortDir : 'asc'} onClick={() => toggleSort(col.sortKey)}>
                      {col.header}
                    </TableSortLabel>
                  ) : (
                    col.header
                  )}
                </TableCell>
              )
            })}
          </TableRow>
        </TableHead>
        <TableBody>
          {isLoading ? (
            Array.from({ length: skeletonRows }).map((_, i) => (
              <TableRow key={`s-${i}`} aria-hidden>
                {visible.map((col) => (
                  <TableCell key={col.key} sx={hideBelow(col.hideBelow)}>
                    <Skeleton height={14} width={`${55 + ((i * 7 + col.key.length * 13) % 40)}%`} />
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : error ? (
            <TableRow>
              <TableCell colSpan={visible.length} sx={{ p: 0 }}>
                <ErrorState error={error} onRetry={onRetry} compact />
              </TableCell>
            </TableRow>
          ) : rows?.length ? (
            rows.map((row, index) => (
              <TableRow
                key={rowKey(row, index)}
                hover={Boolean(onRowClick)}
                sx={onRowClick ? { cursor: 'pointer' } : undefined}
                onClick={
                  onRowClick
                    ? (e) => {
                        if (e.target.closest('a,button,input,select,label,[role="switch"]')) return
                        onRowClick(row)
                      }
                    : undefined
                }
                tabIndex={onRowClick ? 0 : undefined}
                onKeyDown={
                  onRowClick
                    ? (e) => {
                        if (e.key === 'Enter' && e.target === e.currentTarget) onRowClick(row)
                      }
                    : undefined
                }
              >
                {visible.map((col) => (
                  <TableCell
                    key={col.key}
                    align={col.align === 'right' ? 'right' : 'left'}
                    className={col.align === 'right' ? 'tabular' : undefined}
                    sx={[hideBelow(col.hideBelow), ...toArray(col.sx)]}
                  >
                    {col.render
                      ? col.render(row, index)
                      : (row[col.key] ?? (
                          <Box component="span" sx={{ color: 'text.faint' }}>
                            —
                          </Box>
                        ))}
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={visible.length} sx={{ p: 0 }}>
                {empty ?? <EmptyState title="Nothing here yet" description="No records match the current filters." compact />}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
        {footer && rows?.length ? <TableFooter>{footer}</TableFooter> : null}
      </Table>
    </TableContainer>
  )
}

export function Pagination({
  page = 0,
  size = 20,
  totalElements = 0,
  totalPages = 1,
  onPageChange,
  onSizeChange,
  sx,
  sizes = [10, 20, 50, 100],
}) {
  const from = totalElements === 0 ? 0 : page * size + 1
  const to = Math.min(totalElements, (page + 1) * size)
  const last = Math.max(0, totalPages - 1)
  return (
    <Box
      component="nav"
      aria-label="Pagination"
      sx={[
        {
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 1.5,
          borderTop: 1,
          borderColor: 'divider',
          px: 2,
          py: 1.25,
          fontSize: 12.5,
          color: 'text.muted',
        },
        ...toArray(sx),
      ]}
    >
      <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
        <span>
          {totalElements === 0 ? (
            'No results'
          ) : (
            <>
              <Box component="span" className="tabular" sx={{ color: 'text.primary' }}>
                {formatNumber(from)}–{formatNumber(to)}
              </Box>{' '}
              of{' '}
              <Box component="span" className="tabular" sx={{ color: 'text.primary' }}>
                {formatNumber(totalElements)}
              </Box>
            </>
          )}
        </span>
        {onSizeChange ? (
          <Stack component="label" direction="row" spacing={0.75} sx={{ alignItems: 'center' }}>
            <Typography component="span" sx={{ display: { xs: 'none', sm: 'inline' }, fontSize: 'inherit' }}>
              Rows
            </Typography>
            <Select
              value={size}
              onChange={(e) => onSizeChange(Number(e.target.value))}
              compact
              searchable={false}
              popupMinWidth={0}
              aria-label="Rows per page"
              sx={{ width: 84, '& .MuiOutlinedInput-root': { height: 28 }, '& .MuiAutocomplete-input': { padding: '3px 0 !important' } }}
            >
              {sizes.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </Select>
          </Stack>
        ) : null}
      </Stack>
      <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
        <IconButton
          label="First page"
          icon={FirstPageIcon}
          size="sm"
          variant="secondary"
          onClick={() => onPageChange(0)}
          disabled={page <= 0}
        />
        <IconButton
          label="Previous page"
          icon={ChevronLeftIcon}
          size="sm"
          variant="secondary"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 0}
        />
        <Box component="span" className="tabular" sx={{ px: 1 }}>
          Page{' '}
          <Box component="span" sx={{ color: 'text.primary' }}>
            {page + 1}
          </Box>{' '}
          of{' '}
          <Box component="span" sx={{ color: 'text.primary' }}>
            {Math.max(1, totalPages)}
          </Box>
        </Box>
        <IconButton
          label="Next page"
          icon={ChevronRightIcon}
          size="sm"
          variant="secondary"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= last}
        />
        <IconButton
          label="Last page"
          icon={LastPageIcon}
          size="sm"
          variant="secondary"
          onClick={() => onPageChange(last)}
          disabled={page >= last}
        />
      </Stack>
    </Box>
  )
}
