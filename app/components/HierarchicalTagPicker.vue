<script setup lang="ts">
import type { TagOptionGroup } from '#shared/types/meme'

const props = withDefaults(defineProps<{
  groups: TagOptionGroup[]
  selected: string[]
  maxVisible?: number
  emptyText?: string
}>(), {
  maxVisible: 10,
  emptyText: '暂时没有可选标签。',
})

const emit = defineEmits<{
  toggle: [name: string]
}>()

const showAll = ref(false)
const expandedId = ref('')
const visibleGroups = computed(() => showAll.value ? props.groups : props.groups.slice(0, props.maxVisible))
const optionCount = computed(() => props.groups.reduce((sum, group) => sum + 1 + group.children.length, 0))
const selectedKeys = computed(() => new Set(props.selected.map((name) => name.toLocaleLowerCase('zh-CN'))))

function isSelected(name: string) {
  return selectedKeys.value.has(name.toLocaleLowerCase('zh-CN'))
}

function groupIsActive(group: TagOptionGroup) {
  return isSelected(group.name) || group.children.some((child) => isSelected(child.name))
}

function toggleGroup(id: string) {
  expandedId.value = expandedId.value === id ? '' : id
}
</script>

<template>
  <div v-if="groups.length" class="submission-tag-options">
    <div
      v-for="group in visibleGroups"
      :key="group.id"
      class="submission-tag-group"
      :class="{ expanded: expandedId === group.id }"
    >
      <button
        v-if="group.isParent"
        type="button"
        class="submission-parent-tag"
        :class="{ active: groupIsActive(group) }"
        :aria-expanded="expandedId === group.id"
        @click="toggleGroup(group.id)"
      ><span class="submission-parent-star">★</span>#{{ group.name }} <small>{{ group.count }}</small><span class="submission-tag-chevron">⌄</span></button>
      <button
        v-else
        type="button"
        :class="{ active: isSelected(group.name) }"
        @click="emit('toggle', group.name)"
      >#{{ group.name }} <small>{{ group.count }}</small></button>
      <div v-if="group.isParent && expandedId === group.id" class="submission-child-tags">
        <button type="button" :class="{ active: isSelected(group.name) }" @click="emit('toggle', group.name)">#{{ group.name }}（父标签）</button>
        <button
          v-for="child in group.children"
          :key="child.id"
          type="button"
          :class="{ active: isSelected(child.name) }"
          @click="emit('toggle', child.name)"
        >#{{ child.name }} <small>{{ child.count }}</small></button>
      </div>
    </div>
    <button
      v-if="groups.length > maxVisible"
      type="button"
      class="tag-expand-button"
      @click="showAll = !showAll"
    >{{ showAll ? '收起' : `全部 ${optionCount}` }}</button>
  </div>
  <p v-else class="form-hint">{{ emptyText }}</p>
</template>
