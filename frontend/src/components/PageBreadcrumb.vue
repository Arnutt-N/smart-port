<template>
  <nav class="flex items-center gap-2 text-sm text-gray-500 mb-4" aria-label="Breadcrumb">
    <Home class="w-4 h-4 shrink-0" aria-hidden="true" />
    <template v-for="(crumb, index) in crumbs" :key="`${index}-${crumb}`">
      <span aria-hidden="true">/</span>
      <span :class="index === crumbs.length - 1 ? 'text-gray-700' : undefined">{{ crumb }}</span>
    </template>
  </nav>
</template>

<script setup>
import { computed } from 'vue'
import { Home } from 'lucide-vue-next'

const props = defineProps({
  /** Final crumb, or full trail after Home */
  label: { type: String, default: '' },
  items: { type: Array, default: null },
})

const crumbs = computed(() => {
  if (Array.isArray(props.items) && props.items.length > 0) {
    return props.items.map(String)
  }
  return props.label ? [props.label] : []
})
</script>
