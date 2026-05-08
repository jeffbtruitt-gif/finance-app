import { useMemo } from 'react';

/**
 * Animated "particle sky" background for auth pages.
 *
 * Renders a layered radial-gradient base, two corner glows
 * (navy top-left, gold bottom-right), and 70 rising particles
 * with deterministic positions. Pure CSS animation, GPU-accelerated;
 * pauses when the user prefers reduced motion.
 */
export function ParticleSky() {
  const particles = useMemo(() => {
    const seed = (i: number) => {
      const x = Math.sin(i * 9301 + 49297) * 233280;
      return x - Math.floor(x);
    };
    return Array.from({ length: 70 }, (_, i) => ({
      left: seed(i) * 100,
      size: 1 + seed(i + 99) * 3,
      delay: seed(i + 200) * 18,
      dur: 14 + seed(i + 300) * 14,
      gold: seed(i + 400) > 0.6,
      op: 0.3 + seed(i + 500) * 0.5,
    }));
  }, []);

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 overflow-hidden"
      style={{
        background:
          'radial-gradient(110% 70% at 50% 30%, #15203b 0%, #0d1527 55%, #050a14 100%)',
      }}
    >
      <span
        className="absolute rounded-full"
        style={{
          width: 500,
          height: 500,
          top: -150,
          left: -150,
          filter: 'blur(80px)',
          opacity: 0.7,
          background: 'radial-gradient(circle, #243460 0%, transparent 70%)',
        }}
      />
      <span
        className="absolute rounded-full"
        style={{
          width: 480,
          height: 480,
          bottom: -180,
          right: -120,
          filter: 'blur(80px)',
          opacity: 0.18,
          background: 'radial-gradient(circle, #c9a84c 0%, transparent 70%)',
        }}
      />
      {particles.map((p, i) => (
        <span
          key={i}
          className="particle absolute rounded-full"
          style={{
            left: `${p.left}%`,
            bottom: -10,
            width: p.size,
            height: p.size,
            background: p.gold ? '#c9a84c' : '#a9bce0',
            opacity: p.op,
            boxShadow: p.gold
              ? `0 0 ${p.size * 4}px #c9a84c`
              : `0 0 ${p.size * 3}px #6a82c0`,
            animationDuration: `${p.dur}s`,
            animationDelay: `-${p.delay}s`,
            willChange: 'transform, opacity',
          }}
        />
      ))}

      <style>{`
        .particle {
          animation-name: ps-rise;
          animation-timing-function: linear;
          animation-iteration-count: infinite;
        }
        @keyframes ps-rise {
          0%   { transform: translate3d(0, 0, 0);         opacity: 0; }
          10%  { opacity: 1; }
          90%  { opacity: 1; }
          100% { transform: translate3d(40px, -110vh, 0); opacity: 0; }
        }
        @media (prefers-reduced-motion: reduce) {
          .particle { animation: none; opacity: 0.4 !important; }
        }
      `}</style>
    </div>
  );
}
