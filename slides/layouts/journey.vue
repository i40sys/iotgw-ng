<template>
  <div class="slidev-layout journey surface-mist">
    <div class="journey-title"><slot name="title" /></div>
    <ol class="journey-steps" aria-label="Adoption journey">
      <li v-for="step in 3" :key="step" class="journey-step" :class="{ 'is-middle': step === 2 }">
        <div class="journey-heading">
          <span class="journey-number">{{ String(step).padStart(2, '0') }}</span>
          <slot :name="`label${step}`" />
        </div>
        <div class="journey-description"><slot :name="`step${step}`" /></div>
      </li>
    </ol>
    <div class="journey-footer"><slot name="footer" /></div>
  </div>
</template>

<style scoped>
.journey { display: flex; flex-direction: column; }
.journey-title { flex: none; }
.journey-steps {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  position: relative;
  margin: auto 0;
  padding: 0;
  list-style: none;
  gap: 0;
}
.journey-steps::before {
  content: '';
  position: absolute;
  inset: 0 0 auto;
  height: 240px;
  background: var(--or-orange-brand);
  clip-path: polygon(0 0, calc(100% - 48px) 0, 100% 120px, calc(100% - 48px) 240px, 0 240px);
}
.journey-step { position: relative; margin: 0; padding: 0; min-width: 0; }
.journey-step::before { display: none; }
.journey-heading {
  height: 240px;
  position: relative;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  gap: 24px;
  padding: 24px 40px;
  color: var(--or-navy);
  text-align: center;
}
.is-middle .journey-heading {
  width: calc(100% + 48px);
  padding-right: 88px;
  background: var(--or-navy);
  color: var(--or-white);
  clip-path: polygon(0 0, calc(100% - 48px) 0, 100% 50%, calc(100% - 48px) 100%, 0 100%, 48px 50%);
}
.journey-number, .journey-heading :deep(h3) { position: relative; z-index: 1; }
.journey-number { font-family: var(--or-font-ui); font-size: 28px; font-weight: 700; line-height: 1; }
.journey-heading :deep(h3) { margin: 0; font-size: 40px; font-weight: 700; line-height: 1.2; color: inherit; }
.journey-description { padding: 32px 28px 0; text-align: center; }
.journey-description :deep(p) { margin: 0; font-size: 32px; font-weight: 300; line-height: 1.35; text-wrap: balance; }
.journey-footer { flex: none; text-align: center; color: var(--or-fg-muted); font-size: var(--or-fs-small); }
.journey-footer::before { content: ''; display: block; width: 140px; height: 4px; background: var(--or-accent); margin: 0 auto 24px; }
.journey-footer :deep(p) { margin: 0; font-size: inherit; line-height: 1.4; }
</style>
