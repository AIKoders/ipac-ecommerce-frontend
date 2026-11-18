import { ICONS, STAR_PATH, type IconName } from './icons';

export function Icon({ name, class: className }: { name: IconName; class?: string }) {
  return <svg class={className ? `ic ${className}` : 'ic'} viewBox="0 0 24 24" aria-hidden="true" dangerouslySetInnerHTML={{ __html: ICONS[name] }} />;
}

export function Star() {
  return (
    <svg class="st" viewBox="0 0 24 24" aria-hidden="true">
      <path d={STAR_PATH} />
    </svg>
  );
}
