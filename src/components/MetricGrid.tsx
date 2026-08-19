import { DndContext, PointerSensor, TouchSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, arrayMove, rectSortingStrategy, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { EyeRegular, EyeOffRegular } from '@fluentui/react-icons'

import { highlightParts, statMetrics, type Shot, type StatMetric, type StatMetricKey } from '@/lib/format'

const statMetricByKey = Object.fromEntries(statMetrics.map((m) => [m.key, m])) as Record<StatMetricKey, StatMetric>

type MetricGridProps = {
  order: StatMetricKey[]
  hidden: StatMetricKey[]
  editMode: boolean
  shot: Shot
  hasShot: boolean
  units: 'imperial' | 'metric'
  onReorder: (order: StatMetricKey[]) => void
  onToggleHidden: (key: StatMetricKey) => void
}

export function MetricGrid({ order, hidden, editMode, shot, hasShot, units, onReorder, onToggleHidden }: MetricGridProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 8 } }),
  )

  const visible = editMode ? order : order.filter((key) => !hidden.includes(key))

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const from = order.indexOf(active.id as StatMetricKey)
    const to = order.indexOf(over.id as StatMetricKey)
    if (from < 0 || to < 0) return
    onReorder(arrayMove(order, from, to))
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={visible} strategy={rectSortingStrategy}>
        <div className="grid grid-cols-3 gap-1.5 pb-1.5 sm:grid-cols-4 lg:grid-cols-6">
          {visible.map((key) => (
            <MetricTile
              key={key}
              metric={statMetricByKey[key]}
              shot={shot}
              hasShot={hasShot}
              units={units}
              editMode={editMode}
              isHidden={hidden.includes(key)}
              onToggleHidden={() => onToggleHidden(key)}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  )
}

type MetricTileProps = {
  metric: StatMetric
  shot: Shot
  hasShot: boolean
  units: 'imperial' | 'metric'
  editMode: boolean
  isHidden: boolean
  onToggleHidden: () => void
}

function MetricTile({ metric, shot, hasShot, units, editMode, isHidden, onToggleHidden }: MetricTileProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: metric.key, disabled: !editMode })
  const parts = hasShot ? highlightParts(metric, shot, units) : { value: '—' }

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      {...(editMode ? { ...attributes, ...listeners } : {})}
      data-metric={metric.key}
      className={`relative flex aspect-[5/4] min-w-0 select-none flex-col justify-between rounded-[6px] border border-[var(--colorNeutralStroke2)] bg-[var(--colorNeutralBackground2)] p-1.5 sm:p-2 ${isDragging ? 'z-10 shadow-lg' : ''} ${editMode ? 'cursor-grab border-dashed border-[var(--colorBrandStroke1)] touch-none' : ''} ${isHidden && editMode ? 'opacity-40' : ''}`}
    >
      <p className="truncate text-[0.6rem] font-semibold uppercase tracking-[0.06em] text-[var(--colorNeutralForeground3)]" title={metric.label}>
        {metric.label}
      </p>
      <p className="min-w-0 truncate text-center text-[clamp(1.1rem,5.5vw,2.2rem)] font-semibold leading-none tabular-nums tracking-tight text-[var(--colorNeutralForeground1)]">
        {parts.value}
      </p>
      <p className="truncate text-right text-[0.58rem] text-[var(--colorNeutralForeground3)]">{parts.unit ?? '\u00a0'}</p>
      {editMode && (
        <button
          type="button"
          className="absolute right-1 top-1 flex size-6 items-center justify-center rounded text-[var(--colorNeutralForeground2)]"
          onClick={onToggleHidden}
          onPointerDown={(event) => event.stopPropagation()}
          aria-label={isHidden ? `Show ${metric.label}` : `Hide ${metric.label}`}
        >
          {isHidden ? <EyeOffRegular /> : <EyeRegular />}
        </button>
      )}
    </div>
  )
}
