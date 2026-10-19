<script setup lang="ts">
import roseImage from '../assets/gold-rose.webp';

const sparks = [
  { x: '57%', y: '16%', delay: '0s', size: '3px' },
  { x: '72%', y: '11%', delay: '.8s', size: '2px' },
  { x: '89%', y: '27%', delay: '1.5s', size: '4px' },
  { x: '64%', y: '43%', delay: '2.2s', size: '2px' },
  { x: '95%', y: '49%', delay: '.4s', size: '3px' },
  { x: '76%', y: '62%', delay: '1.8s', size: '2px' },
  { x: '56%', y: '70%', delay: '2.7s', size: '3px' },
  { x: '91%', y: '76%', delay: '1.2s', size: '2px' },
];
</script>

<template>
  <section class="rose-home" aria-labelledby="home-title">
    <div class="rose-home-orbit" aria-hidden="true"></div>
    <div class="rose-figure">
      <div class="rose-reveal">
        <img class="rose-image" :src="roseImage" alt="一朵细致的鎏金玫瑰从页面右下角向上生长" />
        <div class="rose-shimmer" aria-hidden="true"></div>
      </div>
    </div>
    <div class="rose-particles" aria-hidden="true">
      <i v-for="spark in sparks" :key="`${spark.x}-${spark.y}`" :style="{ '--x': spark.x, '--y': spark.y, '--delay': spark.delay, '--size': spark.size }"></i>
    </div>
    <div class="rose-home-copy">
      <span>STUDYDOCS · KNOWLEDGE GARDEN</span>
      <h1 id="home-title">让知识，<br />慢慢盛放。</h1>
      <div class="rose-copy-rule"></div>
      <p>每一次思考，都值得被珍藏。</p>
    </div>
  </section>
</template>
