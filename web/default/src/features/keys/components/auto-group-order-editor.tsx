/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.
*/
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowDown,
  ArrowUp,
  Plus,
  Pointer,
  RotateCcw,
  X,
} from 'lucide-react'
import {
  Reorder,
  motion,
  useDragControls,
  useReducedMotion,
} from 'motion/react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { ApiKeyGroupOption } from './api-key-group-combobox'
import './auto-group-order-editor.css'

type AutoGroupOrderEditorProps = {
  value: string[]
  mode: 'inherit' | 'custom'
  options: ApiKeyGroupOption[]
  globalOptions: ApiKeyGroupOption[]
  maxCount: number
  onChange: (value: { groups: string[]; mode: 'inherit' | 'custom' }) => void
}

type AutoGroupRowProps = {
  group: string
  index: number
  option?: ApiKeyGroupOption
  draggable: boolean
  onMove: (index: number, offset: -1 | 1) => void
  onRemove: (group: string) => void
  onDraggingChange: (group: string | null) => void
  count: number
}

function ratioTone(index: number) {
  if (index % 3 === 1) return 'violet'
  if (index % 3 === 2) return 'amber'
  return 'cyan'
}

function RatioBadge({
  ratio,
  index,
}: {
  ratio?: number | string
  index: number
}) {
  const { t } = useTranslation()
  if (ratio === undefined || ratio === null || ratio === '') return null

  return (
    <span className='auto-group-ratio-badge' data-tone={ratioTone(index)}>
      {ratio}x {t('Ratio')}
    </span>
  )
}

function AutoGroupRow({
  group,
  index,
  option,
  draggable,
  onMove,
  onRemove,
  onDraggingChange,
  count,
}: AutoGroupRowProps) {
  const { t } = useTranslation()
  const controls = useDragControls()
  const reduceMotion = useReducedMotion()
  const label = option?.label || group

  const row = (
    <>
      <span className='auto-group-rank' aria-hidden='true'>
        {index + 1}
      </span>
      <span className='auto-group-order-name' title={label}>
        {label}
      </span>
      <RatioBadge ratio={option?.ratio} index={index} />
      {draggable ? (
        <span className='auto-group-order-actions'>
          <Button
            type='button'
            variant='ghost'
            size='icon-sm'
            disabled={index === 0}
            title={t('Move {{group}} up', { group: label })}
            aria-label={t('Move {{group}} up', { group: label })}
            onClick={() => onMove(index, -1)}
          >
            <ArrowUp className='size-5' />
          </Button>
          <Button
            type='button'
            variant='ghost'
            size='icon-sm'
            disabled={index >= count - 1}
            title={t('Move {{group}} down', { group: label })}
            aria-label={t('Move {{group}} down', { group: label })}
            onClick={() => onMove(index, 1)}
          >
            <ArrowDown className='size-5' />
          </Button>
          <Button
            type='button'
            variant='ghost'
            size='icon-sm'
            title={t('Remove {{group}}', { group: label })}
            aria-label={t('Remove {{group}}', { group: label })}
            onClick={() => onRemove(group)}
          >
            <X className='size-5' />
          </Button>
        </span>
      ) : null}
      {index < count - 1 ? (
        <ArrowDown className='auto-group-priority-arrow' aria-hidden='true' />
      ) : null}
    </>
  )

  if (!draggable) {
    return (
      <motion.div
        layout={!reduceMotion}
        className='auto-group-order-row'
        data-disabled='true'
      >
        {row}
      </motion.div>
    )
  }

  return (
    <Reorder.Item
      as='div'
      value={group}
      drag='y'
      dragControls={controls}
      dragListener={false}
      layout={reduceMotion ? undefined : true}
      transition={{
        layout: { type: 'spring', stiffness: 720, damping: 42, mass: 0.5 },
        scale: { type: 'spring', stiffness: 520, damping: 34, mass: 0.35 },
      }}
      whileDrag={reduceMotion ? undefined : { scale: 1.018, zIndex: 5 }}
      className='auto-group-order-row'
      onPointerDown={(event) => {
        if (event.target instanceof Element) {
          if (event.target.closest('button, a, input, select, textarea')) {
            return
          }
        }
        event.preventDefault()
        controls.start(event, { snapToCursor: false })
      }}
      onDragStart={() => onDraggingChange(group)}
      onDragEnd={() => onDraggingChange(null)}
    >
      {row}
    </Reorder.Item>
  )
}

export function AutoGroupOrderEditor({
  value,
  mode,
  options,
  globalOptions,
  maxCount: configuredMaxCount,
  onChange,
}: AutoGroupOrderEditorProps) {
  const { t } = useTranslation()
  const reduceMotion = useReducedMotion()
  const [draggingGroup, setDraggingGroup] = useState<string | null>(null)
  const [showDragHint, setShowDragHint] = useState(false)
  const dragHintTimerRef = useRef<number | null>(null)
  const maxCount =
    Number.isInteger(configuredMaxCount) && configuredMaxCount > 0
      ? configuredMaxCount
      : 5
  const isInheriting = mode === 'inherit'
  const canInherit = globalOptions.length > 0
  const optionMap = useMemo(
    () => new Map(options.map((option) => [option.value, option])),
    [options]
  )
  const displayedGroups = useMemo(
    () =>
      isInheriting
        ? globalOptions.map((option) => option.value)
        : value,
    [globalOptions, isInheriting, value]
  )
  const candidates = options.filter(
    (option) =>
      option.value !== 'auto' && !displayedGroups.includes(option.value)
  )

  const scheduleDragHint = useCallback(() => {
    setShowDragHint(false)
    if (dragHintTimerRef.current !== null) {
      window.clearTimeout(dragHintTimerRef.current)
      dragHintTimerRef.current = null
    }
    if (displayedGroups.length < 2) return
    dragHintTimerRef.current = window.setTimeout(
      () => setShowDragHint(true),
      3200
    )
  }, [displayedGroups.length])

  useEffect(() => {
    scheduleDragHint()
    return () => {
      if (dragHintTimerRef.current !== null) {
        window.clearTimeout(dragHintTimerRef.current)
        dragHintTimerRef.current = null
      }
    }
  }, [scheduleDragHint])

  const handleDraggingChange = (group: string | null) => {
    setDraggingGroup(group)
    if (group) {
      setShowDragHint(false)
      if (dragHintTimerRef.current !== null) {
        window.clearTimeout(dragHintTimerRef.current)
        dragHintTimerRef.current = null
      }
      return
    }
    scheduleDragHint()
  }

  const addGroup = (group: string | null) => {
    if (
      !group ||
      displayedGroups.includes(group) ||
      displayedGroups.length >= maxCount
    ) {
      return
    }
    onChange({ groups: [...displayedGroups, group], mode: 'custom' })
  }

  const moveGroup = (index: number, offset: -1 | 1) => {
    const target = index + offset
    if (target < 0 || target >= displayedGroups.length) return
    const next = [...displayedGroups]
    ;[next[index], next[target]] = [next[target], next[index]]
    onChange({ groups: next, mode: 'custom' })
  }

  const removeGroup = (group: string) => {
    onChange({
      groups: displayedGroups.filter((item) => item !== group),
      mode: 'custom',
    })
  }

  const displayedCount = displayedGroups.length

  return (
    <div className='space-y-3'>
      <div className='auto-group-order-heading'>
        <div className='auto-group-order-title'>{t('Auto assignment order')}</div>
        <Button
          type='button'
          variant='outline'
          size='sm'
          className='auto-group-restore-button'
          disabled={isInheriting || !canInherit}
          onClick={() => onChange({ groups: [], mode: 'inherit' })}
        >
          <RotateCcw className='size-4' />
          <span className='hidden sm:inline'>{t('Restore global Auto')}</span>
        </Button>
      </div>

      <div
        className='auto-group-order-editor rounded-[1.35rem] p-3 sm:p-4'
        data-dragging={draggingGroup ? 'true' : undefined}
        onPointerDown={scheduleDragHint}
      >
        <div className='mb-3 flex items-center justify-between gap-2 px-1'>
          <span className='auto-group-order-count text-sm font-semibold text-slate-300'>
            {t(
              'Failed groups cool down for 90s; after cooldown, restart from priority 1'
            )}
          </span>
          {draggingGroup ? (
            <span className='text-xs font-medium text-cyan-200'>
              {t('Release to place {{group}}', { group: draggingGroup })}
            </span>
          ) : null}
        </div>

        {showDragHint ? (
          <motion.div
            className='auto-group-drag-hint'
            initial={reduceMotion ? undefined : { opacity: 0, y: 8, scale: 0.96 }}
            animate={reduceMotion ? undefined : { opacity: 1, y: 0, scale: 1 }}
            transition={{ type: 'spring', stiffness: 360, damping: 24 }}
            aria-hidden='true'
          >
            <img
              className='auto-group-click-reference'
              src='/auto-click-hand-dark.svg?v=20260803-black'
              alt=''
              aria-hidden='true'
            />
            <Pointer
              className='auto-group-drag-hint-hand'
              strokeWidth={1.75}
            />
          </motion.div>
        ) : null}

        {displayedGroups.length === 0 ? (
          <div className='rounded-xl border border-dashed border-slate-600/70 px-4 py-7 text-center text-xs text-slate-400'>
            {isInheriting
              ? t('No available groups in the global Auto order.')
              : t('Select at least one Auto group or restore global Auto.')}
          </div>
        ) : (
          <Reorder.Group
            as='div'
            axis='y'
            values={displayedGroups}
            onReorder={(next) => onChange({ groups: next, mode: 'custom' })}
            className='space-y-4'
          >
            {displayedGroups.map((group, index) => (
              <AutoGroupRow
                key={group}
                group={group}
                index={index}
                option={optionMap.get(group)}
                draggable
                onMove={moveGroup}
                onRemove={removeGroup}
                onDraggingChange={handleDraggingChange}
                count={displayedCount}
              />
            ))}
          </Reorder.Group>
        )}

        <Select value={null} onValueChange={addGroup}>
          <SelectTrigger
            className='auto-group-add-trigger mt-3 w-full'
            disabled={displayedGroups.length >= maxCount || candidates.length === 0}
          >
            <SelectValue
              placeholder={
                <span className='flex items-center gap-3'>
                  <span className='auto-group-add-icon'>
                    <Plus className='size-7' />
                  </span>
                  <span className='text-base font-semibold'>
                    {displayedGroups.length >= maxCount
                      ? t('Maximum {{max}} groups selected', { max: maxCount })
                      : t('Add Auto group')}
                  </span>
                </span>
              }
            />
          </SelectTrigger>
          <SelectContent alignItemWithTrigger={false}>
            <SelectGroup>
              {candidates.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  <span className='flex w-full items-center justify-between gap-3'>
                    <span>{option.label}</span>
                    <RatioBadge ratio={option.ratio} index={displayedGroups.length} />
                  </span>
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}
