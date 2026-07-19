type Props = {
  title: string;
  reason: string;
  evidencePaths?: string[];
};

export function UnavailablePanel({ title, reason, evidencePaths }: Props) {
  return (
    <section
      style={{
        border: "1px solid #5c3d2e",
        background: "#1c1410",
        borderRadius: 8,
        padding: 16,
        marginTop: 12,
      }}
    >
      <h3 style={{ margin: "0 0 8px", color: "#ffab91" }}>{title} — NOT AVAILABLE</h3>
      <p style={{ margin: 0, color: "#ccc", fontSize: 14 }}>{reason}</p>
      {evidencePaths && evidencePaths.length > 0 && (
        <ul style={{ margin: "8px 0 0", paddingLeft: 20, fontSize: 12, color: "#888" }}>
          {evidencePaths.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}
    </section>
  );
}
