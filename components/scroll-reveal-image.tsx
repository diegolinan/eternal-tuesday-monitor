'use client';

import { useEffect, useRef } from 'react';

type ScrollRevealImageProps = {
  src: string;
  alt: string;
  width: number;
  height: number;
  className?: string;
};

export function ScrollRevealImage({
  src,
  alt,
  width,
  height,
  className = '',
}: ScrollRevealImageProps) {
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = root.current;
    if (!element) return;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let frame = 0;
    const paint = () => {
      frame = 0;
      if (reducedMotion.matches) {
        element.style.setProperty('--image-reveal', '100%');
        return;
      }
      const bounds = element.getBoundingClientRect();
      const start = window.innerHeight * 0.9;
      const finish = window.innerHeight * 0.22;
      const progress = Math.min(
        1,
        Math.max(0, (start - bounds.top) / (start - finish)),
      );
      element.style.setProperty(
        '--image-reveal',
        `${(progress * 100).toFixed(1)}%`,
      );
    };
    const queue = () => {
      if (!frame) frame = window.requestAnimationFrame(paint);
    };
    paint();
    window.addEventListener('scroll', queue, { passive: true });
    window.addEventListener('resize', queue);
    reducedMotion.addEventListener('change', queue);
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener('scroll', queue);
      window.removeEventListener('resize', queue);
      reducedMotion.removeEventListener('change', queue);
    };
  }, []);

  return (
    <div ref={root} className={`scroll-reveal-image ${className}`}>
      <img
        className="scroll-reveal-image__base"
        src={src}
        alt=""
        aria-hidden="true"
        width={width}
        height={height}
        loading="lazy"
        decoding="async"
      />
      <img
        className="scroll-reveal-image__color"
        src={src}
        alt={alt}
        width={width}
        height={height}
        loading="lazy"
        decoding="async"
      />
    </div>
  );
}
