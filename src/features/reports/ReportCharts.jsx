import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Line,
  LineChart,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { Skeleton } from '@/components/ui/Feedback'
import { CHART_BG, CHART_CURSOR, ChartLegend, ChartTooltip, SERIES, STATUS_COLORS, axisProps, gridProps } from '@/components/ui/charts'
import { formatCompactNumber, formatCurrency, formatDate, formatShortDate } from '@/utils/format'
import { formatValue, labelWidth, legendItems, seriesColor, tickFormatter } from './chartSpec'

/* ---------- KPI tiles ---------- */

const TONE_FG = { success: 'soft.success.fg', warning: 'soft.warning.fg', danger: 'soft.danger.fg', info: 'soft.info.fg' }

export function KpiTile({ kpi, dense = false }) {
  const text = formatValue(kpi.value, kpi.format, kpi.decimals)
  const long = text.length > 11
  return (
    <Box
      sx={{
        p: dense ? 1.5 : 2,
        border: 1,
        borderColor: 'divider',
        borderRadius: dense ? '8px' : '10px',
        bgcolor: 'background.paper',
        minWidth: 0,
        breakInside: 'avoid',
      }}
    >
      <Typography component="span" sx={{ display: 'block', fontSize: dense ? 11.5 : 12.5, fontWeight: 500, color: 'text.muted' }} noWrap>
        {kpi.label}
      </Typography>
      <Typography
        component="span"
        className="tabular"
        sx={{
          display: 'block',
          mt: dense ? 0.25 : 0.75,
          fontSize: dense ? (long ? 15.5 : 20) : long ? 19 : 22,
          fontWeight: 600,
          letterSpacing: '-0.01em',
          whiteSpace: dense ? 'nowrap' : 'normal',
          overflowWrap: 'anywhere',
          lineHeight: 1.2,
          color: kpi.tone && TONE_FG[kpi.tone] ? TONE_FG[kpi.tone] : 'text.primary',
        }}
      >
        {text}
      </Typography>
      {kpi.hint ? (
        <Typography component="span" sx={{ display: 'block', mt: 0.5, fontSize: dense ? 11 : 12, color: 'text.muted' }} noWrap>
          {kpi.hint}
        </Typography>
      ) : null}
    </Box>
  )
}

export function KpiRow({ kpis, loading, dense = false, sx }) {
  const n = loading ? 5 : (kpis?.length ?? 0)
  if (!n) return null
  const long = !loading && kpis.some((k) => formatValue(k.value, k.format, k.decimals).length > 11)
  const cols = dense && long && n > 4 ? 3 : Math.min(6, Math.max(2, n))
  return (
    <Box
      sx={[
        {
          display: 'grid',
          gap: dense ? 1 : 1.5,
          gridTemplateColumns: dense
            ? `repeat(${cols}, minmax(0, 1fr))`
            : { xs: 'repeat(2, minmax(0, 1fr))', sm: 'repeat(3, minmax(0, 1fr))', lg: `repeat(${cols}, minmax(0, 1fr))` },
        },
        ...(Array.isArray(sx) ? sx : sx ? [sx] : []),
      ]}
    >
      {loading
        ? Array.from({ length: n }, (_, i) => <Skeleton key={i} height={dense ? 64 : 84} />)
        : kpis.map((k) => <KpiTile key={k.key} kpi={k} dense={dense} />)}
    </Box>
  )
}

/* ---------- chart bodies ---------- */

function DivergingLabel({ x, y, width, height, value, format }) {
  if (value == null) return null
  // Always label to the right of the bar's right edge: the tip for positive bars,
  // the zero line for negative ones, so labels never collide with the axis names.
  const right = Math.max(x, x + width)
  return (
    <text
      x={right + 4}
      y={y + height / 2}
      dy={4}
      textAnchor="start"
      fontSize={11}
      fill="var(--limoz-palette-text-secondary)"
      className="tabular"
    >
      {formatValue(value, format)}
    </text>
  )
}

/** Clean tick steps (1·2·2.5·5·10 × 10ⁿ) for an axis that must include zero. */
function niceStep(range, count = 5) {
  const raw = range / count
  const mag = 10 ** Math.floor(Math.log10(raw || 1))
  return [1, 2, 2.5, 5, 10].map((m) => m * mag).find((c) => c >= raw) ?? 10 * mag
}
function divergingScale(values) {
  const min = Math.min(0, ...values)
  const max = Math.max(0, ...values)
  const step = niceStep(max - min || 1)
  const lo = Math.floor(min / step) * step
  const hi = Math.ceil(max / step) * step
  const ticks = []
  for (let t = lo; t <= hi + step / 2; t += step) ticks.push(Math.round(t * 1000) / 1000)
  return { domain: [lo, hi], ticks }
}

function CartesianChart({ chart, width, height, interactive }) {
  const { type, data, series, x, stacked } = chart
  const horizontal = type === 'hbar' || type === 'diverging'
  const dateAxis = x?.format === 'date'
  const anim = interactive
  const measure = series[0]
  const fmt = Object.fromEntries(series.map((s) => [s.key, (v) => formatValue(v, s.format, s.decimals)]))
  const names = Object.fromEntries(series.map((s) => [s.key, s.label]))
  const single = series.length === 1
  const showLabels = !interactive || (single && data.length <= 12)
  const tooltip = interactive ? (
    <Tooltip
      cursor={type === 'line' || type === 'area' ? { stroke: 'var(--limoz-palette-edge-strong)' } : { fill: CHART_CURSOR }}
      content={<ChartTooltip labelFormatter={dateAxis ? formatDate : undefined} names={names} format={fmt} />}
    />
  ) : null

  const categoryAxis = horizontal ? (
    <YAxis
      type="category"
      dataKey={x.key}
      {...axisProps}
      width={labelWidth(data, x.key)}
      interval={0}
      tick={{ fontSize: 11.5, fontWeight: 500 }}
    />
  ) : (
    <XAxis
      dataKey={x.key}
      {...axisProps}
      tickFormatter={dateAxis ? formatShortDate : undefined}
      minTickGap={dateAxis ? 28 : 8}
      interval={dateAxis ? 'preserveStartEnd' : data.length <= 10 ? 0 : undefined}
    />
  )
  const diverging = type === 'diverging' ? divergingScale(data.map((d) => d[measure.key] ?? 0)) : null
  const valueAxis = horizontal ? (
    <XAxis
      type="number"
      {...axisProps}
      tickFormatter={tickFormatter(measure.format)}
      allowDecimals={false}
      domain={chart.domain ?? diverging?.domain}
      ticks={diverging?.ticks}
    />
  ) : (
    <YAxis {...axisProps} tickFormatter={tickFormatter(measure.format)} width={44} allowDecimals={false} domain={chart.domain} />
  )

  const common = {
    data,
    width,
    height,
    layout: horizontal ? 'vertical' : 'horizontal',
    margin: horizontal
      ? { top: 4, right: showLabels ? 56 : 16, left: 0, bottom: 0 }
      : { top: showLabels ? 18 : 8, right: 8, left: -12, bottom: 0 },
  }
  const grid = <CartesianGrid {...gridProps} horizontal={!horizontal} vertical={horizontal} />

  if (type === 'line')
    return (
      <LineChart {...common}>
        {grid}
        {categoryAxis}
        {valueAxis}
        {tooltip}
        {series.map((s, i) => (
          <Line
            key={s.key}
            type="monotone"
            dataKey={s.key}
            stroke={seriesColor(s, i)}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, strokeWidth: 2, stroke: CHART_BG }}
            isAnimationActive={anim}
          />
        ))}
      </LineChart>
    )

  if (type === 'area') {
    const id = `fill-${chart.key}`
    return (
      <AreaChart {...common}>
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={seriesColor(measure, 0)} stopOpacity={0.18} />
            <stop offset="100%" stopColor={seriesColor(measure, 0)} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        {grid}
        {categoryAxis}
        {valueAxis}
        {tooltip}
        <Area
          type="monotone"
          dataKey={measure.key}
          stroke={seriesColor(measure, 0)}
          strokeWidth={2}
          fill={`url(#${id})`}
          dot={false}
          activeDot={{ r: 4, strokeWidth: 2, stroke: CHART_BG }}
          isAnimationActive={anim}
        />
      </AreaChart>
    )
  }

  if (type === 'diverging') {
    const positive = seriesColor(measure, 0)
    const negative = STATUS_COLORS[chart.negativeTone ?? 'danger']
    return (
      <BarChart {...common} margin={{ top: 4, right: 64, left: 56, bottom: 0 }} barCategoryGap={6}>
        {grid}
        {categoryAxis}
        {valueAxis}
        {tooltip}
        <ReferenceLine x={0} stroke="var(--limoz-palette-chart-axis)" />
        <Bar dataKey={measure.key} maxBarSize={18} radius={4} isAnimationActive={anim} animationDuration={500}>
          {data.map((d, i) => (
            <Cell key={i} fill={d[measure.key] < 0 ? negative : positive} />
          ))}
          <LabelList dataKey={measure.key} content={(p) => <DivergingLabel {...p} format={measure.format} />} />
        </Bar>
      </BarChart>
    )
  }

  // bar / hbar (optionally stacked)
  const last = series.length - 1
  const radius = (i) => {
    if (stacked && i !== last) return 0
    return horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0]
  }
  return (
    <BarChart {...common} barCategoryGap={stacked || single ? 6 : 10} barGap={2}>
      {grid}
      {categoryAxis}
      {valueAxis}
      {tooltip}
      {series.map((s, i) => (
        <Bar
          key={s.key}
          dataKey={s.key}
          stackId={stacked ? 'stack' : undefined}
          fill={seriesColor(s, i)}
          radius={radius(i)}
          maxBarSize={24}
          stroke={stacked ? CHART_BG : undefined}
          strokeWidth={stacked ? 1 : 0}
          isAnimationActive={anim}
          animationDuration={500}
        >
          {chart.colorByRow && single
            ? data.map((d, j) => <Cell key={j} fill={d.tone ? STATUS_COLORS[d.tone] : seriesColor(s, i)} />)
            : null}
          {showLabels && single ? (
            <LabelList
              dataKey={s.key}
              position={horizontal ? 'right' : 'top'}
              offset={6}
              formatter={(v) => (v ? formatValue(v, s.format, s.decimals) : '')}
              style={{ fontSize: 11, fill: 'var(--limoz-palette-text-secondary)' }}
              className="tabular"
            />
          ) : null}
        </Bar>
      ))}
    </BarChart>
  )
}

function DonutChart({ chart, height, interactive, dense }) {
  const measure = chart.series[0]
  const total = chart.data.reduce((s, d) => s + (d.value ?? 0), 0)
  const colors = chart.data.map((d, i) => (d.tone ? STATUS_COLORS[d.tone] : SERIES[i % SERIES.length]))
  const size = Math.min(height, dense ? 128 : 176)
  return (
    <Stack direction="row" spacing={dense ? 1.5 : 2.5} sx={{ alignItems: 'center', height, minWidth: 0 }}>
      <Box sx={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
        <PieChart width={size} height={size}>
          <Pie
            data={chart.data}
            dataKey="value"
            nameKey="label"
            cx="50%"
            cy="50%"
            innerRadius="68%"
            outerRadius="100%"
            paddingAngle={chart.data.length > 1 ? 2 : 0}
            stroke={CHART_BG}
            strokeWidth={2}
            startAngle={90}
            endAngle={-270}
            isAnimationActive={interactive}
            animationDuration={500}
          >
            {chart.data.map((d, i) => (
              <Cell key={d.label} fill={colors[i]} />
            ))}
          </Pie>
          {interactive ? (
            <Tooltip
              content={({ active, payload }) =>
                active && payload?.length ? (
                  <ChartTooltip
                    active
                    payload={payload.map((p) => ({ ...p, dataKey: 'value', color: p.payload.fill }))}
                    names={{ value: payload[0].name }}
                    format={{ value: (v) => formatValue(v, measure.format) }}
                  />
                ) : null
              }
            />
          ) : null}
        </PieChart>
        <Box
          sx={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            pointerEvents: 'none',
          }}
        >
          <Typography component="span" className="tabular" sx={{ fontSize: size > 150 ? 20 : 17, fontWeight: 600, lineHeight: 1.1 }}>
            {measure.format === 'currency' ? formatCurrency(total, { compact: true }).replace('RWF ', '') : formatCompactNumber(total)}
          </Typography>
          <Typography component="span" sx={{ fontSize: 11, color: 'text.muted' }}>
            {measure.label}
          </Typography>
        </Box>
      </Box>
      <Stack component="ul" spacing={0.75} sx={{ listStyle: 'none', m: 0, p: 0, minWidth: 0, flex: 1, fontSize: dense ? 11.5 : 12.5 }}>
        {chart.data.map((d, i) => (
          <Stack key={d.label} component="li" direction="row" spacing={1} sx={{ alignItems: 'center', minWidth: 0 }}>
            <Box component="span" sx={{ width: 10, height: 10, borderRadius: '2px', bgcolor: colors[i], flexShrink: 0 }} aria-hidden />
            <Typography component="span" noWrap sx={{ flex: 1, minWidth: 0, fontSize: 'inherit', color: 'text.secondary' }}>
              {d.label}
            </Typography>
            <Typography component="span" className="tabular" sx={{ fontSize: 'inherit', fontWeight: 500 }}>
              {formatValue(d.value, measure.format)}
            </Typography>
            <Typography
              component="span"
              className="tabular"
              sx={{ width: 36, textAlign: 'right', fontSize: 'inherit', color: 'text.muted' }}
            >
              {total ? `${Math.round((d.value / total) * 100)}%` : ''}
            </Typography>
          </Stack>
        ))}
      </Stack>
    </Stack>
  )
}

/**
 * Renders one chart from the report's `summary.charts` spec.
 * With `width` set the chart is drawn at a fixed size and without hover (print);
 * otherwise it fills its container and gets tooltips.
 */
export function ReportChart({ chart, width, dense = false }) {
  const interactive = width == null
  const height =
    chart.height ?? (chart.type === 'hbar' || chart.type === 'diverging' ? Math.max(150, chart.data.length * 28 + 30) : dense ? 190 : 230)
  if (!chart.data.length)
    return (
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: Math.min(height, 160),
          fontSize: 13,
          color: 'text.muted',
        }}
      >
        No data for this period.
      </Box>
    )
  if (chart.type === 'donut')
    return <DonutChart chart={chart} height={Math.min(height, dense ? 160 : 190)} interactive={interactive} dense={dense} />
  if (interactive)
    return (
      <Box sx={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <CartesianChart chart={chart} interactive />
        </ResponsiveContainer>
      </Box>
    )
  return <CartesianChart chart={chart} width={width} height={height} interactive={false} />
}

/** Grid of chart cards for the on-screen report view. */
export function ChartGrid({ charts, loading }) {
  if (loading)
    return (
      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' } }}>
        <Skeleton height={300} sx={{ gridColumn: { md: 'span 2' } }} />
        <Skeleton height={260} />
        <Skeleton height={260} />
      </Box>
    )
  if (!charts?.length) return null
  return (
    <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' } }}>
      {charts.map((c) => (
        <Card key={c.key} sx={{ gridColumn: c.span === 2 ? { md: 'span 2' } : undefined, minWidth: 0 }}>
          <CardHeader title={c.title} description={c.subtitle} compact />
          <CardBody sx={{ p: 2 }}>
            {c.series.length > 1 && c.type !== 'donut' ? <ChartLegend items={legendItems(c)} sx={{ mb: 1.5 }} /> : null}
            <ReportChart chart={c} />
          </CardBody>
        </Card>
      ))}
    </Box>
  )
}
