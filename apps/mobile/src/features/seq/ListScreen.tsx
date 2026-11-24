import type { UseQueryResult } from '@tanstack/react-query'
import type { ReactElement, ReactNode } from 'react'
import { FlatList, RefreshControl, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { usePalette } from '@/theme'
import { EmptyState, ErrorState, LoadingState, type IconName } from '@/ui'

interface ListScreenProps<D, T> {
  query: UseQueryResult<D>
  items: (data: D) => readonly T[]
  keyOf: (item: T) => string
  renderItem: (item: T, data: D) => ReactElement
  header?: (data: D) => ReactNode
  emptyTitle?: string
  emptyIcon?: IconName
}

/** A pull-to-refresh list with the shared loading, error and empty states. */
export function ListScreen<D, T>({ query, items, keyOf, renderItem, header, emptyTitle, emptyIcon }: ListScreenProps<D, T>) {
  const palette = usePalette('seq')
  const insets = useSafeAreaInsets()
  if (query.data === undefined) {
    return query.isError ? <ErrorState error={query.error} onRetry={() => void query.refetch()} /> : <LoadingState />
  }
  const data = query.data
  return (
    <FlatList
      className="flex-1 bg-background"
      data={items(data)}
      keyExtractor={keyOf}
      renderItem={({ item }) => renderItem(item, data)}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24, gap: 12 }}
      ListHeaderComponent={header ? <View className="gap-4">{header(data)}</View> : undefined}
      ListEmptyComponent={<EmptyState title={emptyTitle} icon={emptyIcon} />}
      refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => void query.refetch()} tintColor={palette.accent} />}
    />
  )
}
