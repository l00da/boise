import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import type { ImuFixtureSample } from "./api";

type Props = {
  samples: ImuFixtureSample[];
};

export function SampleChart({ samples }: Props) {
  const data = samples.map((s) => ({
    t: s.epochMs,
    ax: s.accG[0],
    ay: s.accG[1],
    az: s.accG[2],
    gx: s.gyroDps[0],
    gy: s.gyroDps[1],
    gz: s.gyroDps[2],
  }));

  return (
    <div style={{ width: "100%", height: 360 }}>
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
          <CartesianGrid stroke="#333" strokeDasharray="3 3" />
          <XAxis dataKey="t" stroke="#888" label={{ value: "epochMs", position: "insideBottom", offset: -4 }} />
          <YAxis stroke="#888" />
          <Tooltip contentStyle={{ background: "#1a1d27", border: "1px solid #333" }} />
          <Legend />
          <Line type="monotone" dataKey="ax" stroke="#4fc3f7" dot={false} strokeWidth={1} />
          <Line type="monotone" dataKey="ay" stroke="#81c784" dot={false} strokeWidth={1} />
          <Line type="monotone" dataKey="az" stroke="#ffb74d" dot={false} strokeWidth={1} />
          <Line type="monotone" dataKey="gx" stroke="#e57373" dot={false} strokeWidth={1} />
          <Line type="monotone" dataKey="gy" stroke="#ba68c8" dot={false} strokeWidth={1} />
          <Line type="monotone" dataKey="gz" stroke="#fff176" dot={false} strokeWidth={1} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
