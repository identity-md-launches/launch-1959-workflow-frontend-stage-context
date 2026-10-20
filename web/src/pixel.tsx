import type { CSSProperties } from "react";
export function Hamster({
  running = false,
  small = false,
}: {
  running?: boolean;
  small?: boolean;
}) {
  return (
    <svg
      viewBox="0 0 400 200"
      className={`pixel-cage ${running ? "running" : ""} ${small ? "small" : ""}`}
      role="img"
      aria-label={
        running
          ? "An original pixel hamster running in its wheel"
          : "An original pixel hamster sleeping beside its wheel"
      }
      shapeRendering="crispEdges"
    >
      <defs>
        <pattern
          id="cage-grid"
          width="20"
          height="20"
          patternUnits="userSpaceOnUse"
        >
          <path
            d="M20 0H0V20"
            fill="none"
            stroke="currentColor"
            strokeWidth=".6"
            opacity=".08"
          />
        </pattern>
        <pattern
          id="bedding"
          width="30"
          height="15"
          patternUnits="userSpaceOnUse"
        >
          <path d="M2 5h9v3H2zM19 11h7v3h-7z" fill="#B89B6C" opacity=".5" />
        </pattern>
      </defs>
      <rect width="400" height="200" fill="url(#cage-grid)" />
      <path
        d="M29 165V45h8V34h325v11h8v120"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        opacity=".25"
      />
      <path d="M24 165h351v24H24z" fill="#E9D9C3" />
      <path d="M24 165h351v24H24z" fill="url(#bedding)" />
      <path d="M20 189h359v5H20z" fill="#BBA789" />
      <g opacity=".5" stroke="currentColor" strokeWidth="3">
        <path d="M52 43v112M83 43v112M114 43v112M145 43v112M176 43v112M207 43v112M238 43v112M269 43v112M300 43v112M331 43v112M354 43v112" />
      </g>
      <path d="M247 146v21m-25 0h51" stroke="#8A7765" strokeWidth="6" />
      <g
        className="wheel"
        style={{ transformOrigin: "247px 103px" }}
        fill="none"
        stroke="#B99ACD"
        strokeWidth="6"
      >
        <circle cx="247" cy="103" r="62" />
        <circle cx="247" cy="103" r="51" strokeWidth="2" />
        <path
          d="M247 44v118M188 103h118M205 61l84 84M205 145l84-84"
          strokeWidth="3"
        />
        <rect
          x="241"
          y="97"
          width="12"
          height="12"
          fill="#B99ACD"
          stroke="none"
        />
      </g>
      <g
        className="hamster-body"
        transform={
          running ? "translate(198 92) scale(.7)" : "translate(67 108)"
        }
      >
        <path
          d="M10 14V2h14v7h29V1h16v15h8v12h8v29H0V34h5V14z"
          fill="#8E5338"
        />
        <path
          d="M15 14V7h6v10h35V6h8v13h9v13h7v20H5V35h5V19h5z"
          fill="#E8A469"
        />
        <path d="M16 8h6v8h-6zM57 7h6v9h-6z" fill="#FFB4A5" />
        <path d="M20 30h40v5h10v18H10V39h10z" fill="#FFF0CF" />
        {running ? (
          <path d="M24 25h5v6h-5zM55 25h5v6h-5z" fill="#2B2118" />
        ) : (
          <path d="M20 28h12v3H20zM51 28h12v3H51z" fill="#2B2118" />
        )}
        <path d="M37 34h10v5H37z" fill="#C67972" />
        <path d="M39 39h5v4h-5z" fill="#8E5338" />
        <path d="M10 35h9v5h-9zM65 35h9v5h-9z" fill="#F4C49D" />
        <g className="hamster-feet" fill="#8E5338">
          <path d="M13 51h14v7H13zM57 51h14v7H57z" />
        </g>
      </g>
      {!running && (
        <g className="sleep-z" fill="currentColor" opacity=".6">
          <path d="M141 102h10v3l-7 7h7v3h-11v-3l7-7h-6z" />
          <path d="M156 82h12v3l-9 9h9v3h-13v-3l9-9h-8z" />
          <path d="M177 62h14v4l-10 10h10v4h-15v-4l10-10h-9z" />
        </g>
      )}
      <g fill="#A8E6C6">
        <path d="M326 140h23v23h-23z" />
        <path d="M330 136h15v4h-15z" />
      </g>
      <path d="M328 142h19v4h-19" fill="#5D997E" />
      <g fill="#B89B6C">
        <path d="M165 171h7v4h-7zM190 180h9v3h-9zM305 174h6v4h-6z" />
      </g>
    </svg>
  );
}
export function Seed({ fill = 0 }: { fill?: number }) {
  return (
    <svg className="seed" viewBox="0 0 24 32" aria-hidden="true">
      <defs>
        <clipPath id={`seed-${fill}`}>
          <path d="M12 2 20 10 22 20 18 28 12 31 6 28 2 20 4 10Z" />
        </clipPath>
      </defs>
      <path
        d="M12 2 20 10 22 20 18 28 12 31 6 28 2 20 4 10Z"
        fill="var(--line)"
      />
      <rect
        x="0"
        y={32 - fill * 32}
        width="24"
        height="32"
        fill="#C18B32"
        clipPath={`url(#seed-${fill})`}
      />
      <path d="m12 7 2 17-2 4-2-4z" fill="var(--card)" opacity=".7" />
    </svg>
  );
}
export function Jar({ fill = 0 }: { fill?: number }) {
  return (
    <svg
      className="coin-jar"
      viewBox="0 0 100 110"
      aria-hidden="true"
      shapeRendering="crispEdges"
    >
      <path d="M28 5h44v10h7v13h8v68h-8v9H21v-9h-8V28h8V15h7z" fill="#4A435B" />
      <path d="M28 18h44v13h8v63H20V31h8z" fill="#353047" />
      <path d={`M21 ${92 - fill * 58}h58V94H21z`} fill="#7E672F" />
      {Array.from({ length: 14 }, (_, i) => (
        <g
          key={i}
          transform={`translate(${23 + (i % 3) * 18 + (i % 2) * 3} ${83 - Math.floor(i / 3) * 12})`}
          opacity={i < Math.max(2, Math.ceil(fill * 14)) ? 1 : 0.14}
        >
          <path d="M3 0h11v3h3v7h-3v3H3v-3H0V3h3z" fill="#FFE08A" />
          <path d="M7 3h3v7H7z" fill="#BB8E38" />
        </g>
      ))}
      <path d="M25 7h50v8H25z" fill="#CDB8FF" />
      <path d="M22 35v29" stroke="#FFF5E6" strokeWidth="3" opacity=".35" />
    </svg>
  );
}
export function Confetti() {
  return (
    <div className="confetti" aria-hidden="true">
      {Array.from({ length: 30 }, (_, i) => (
        <i
          key={i}
          style={
            {
              "--i": i,
              "--color": ["#FFB48A", "#FFE08A", "#A8E6C6", "#CDB8FF"][i % 4],
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
}
