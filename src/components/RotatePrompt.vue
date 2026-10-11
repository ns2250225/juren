<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { useSettings } from '../stores/settings'

const settings = useSettings()
const portrait = ref(false)
const check = () => (portrait.value = window.innerHeight > window.innerWidth * 1.05)
onMounted(() => {
  check()
  window.addEventListener('resize', check)
  window.addEventListener('orientationchange', check)
})
onBeforeUnmount(() => {
  window.removeEventListener('resize', check)
  window.removeEventListener('orientationchange', check)
})
</script>

<template>
  <div v-if="settings.mobile && portrait" class="rotate">
    <div class="phone"><div class="screen-i"></div></div>
    <div class="t">请将设备横屏游玩</div>
    <div class="muted">浏览器不支持自动锁定横屏时，请关闭方向锁定并旋转手机</div>
  </div>
</template>

<style scoped>
.rotate {
  position: fixed;
  inset: 0;
  z-index: 999;
  background: #0d0907;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 18px;
  text-align: center;
  padding: 30px;
}
.phone {
  width: 60px;
  height: 100px;
  border: 5px solid var(--parchment);
  border-radius: 10px;
  animation: rot 2s ease-in-out infinite;
  padding: 6px;
}
.screen-i {
  width: 100%;
  height: 100%;
  background: var(--red);
}
@keyframes rot {
  0%,
  20% {
    transform: rotate(0);
  }
  60%,
  100% {
    transform: rotate(-90deg);
  }
}
.t {
  font-family: var(--font-title);
  font-size: 28px;
  color: var(--parchment);
}
</style>
