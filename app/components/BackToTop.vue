<script setup lang="ts">
const visible = ref(false)

function updateVisibility() {
  visible.value = window.scrollY > 600
}

function backToTop() {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' })
}

onMounted(() => {
  updateVisibility()
  window.addEventListener('scroll', updateVisibility, { passive: true })
})

onBeforeUnmount(() => {
  window.removeEventListener('scroll', updateVisibility)
})
</script>

<template>
  <Transition name="back-to-top">
    <button
      v-if="visible"
      class="back-to-top"
      type="button"
      aria-label="返回页面顶部"
      title="返回顶部"
      @click="backToTop"
    >
      <span aria-hidden="true">TOP</span>
      <small aria-hidden="true">↑</small>
    </button>
  </Transition>
</template>
