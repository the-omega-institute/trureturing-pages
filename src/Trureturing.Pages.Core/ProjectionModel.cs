using System.Text.Json.Serialization;

namespace Trureturing.Pages.Core;

internal sealed class ProjectionDocument
{
    internal ProjectionDocument(
        ProjectionSourceSnapshot sourceSnapshot,
        ProjectionCounts counts,
        string note,
        IReadOnlyList<ProjectionNode> nodes)
    {
        SourceSnapshot = sourceSnapshot;
        Counts = counts;
        Note = note;
        Nodes = nodes;
    }

    [JsonPropertyName("schema_version")]
    [JsonPropertyOrder(0)]
    public string SchemaVersion { get; } = "truth-graph.v1";

    [JsonPropertyName("synthetic")]
    [JsonPropertyOrder(1)]
    public bool Synthetic { get; } = false;

    [JsonPropertyName("source_snapshot")]
    [JsonPropertyOrder(2)]
    public ProjectionSourceSnapshot SourceSnapshot { get; }

    [JsonPropertyName("counts")]
    [JsonPropertyOrder(3)]
    public ProjectionCounts Counts { get; }

    [JsonPropertyName("note")]
    [JsonPropertyOrder(4)]
    public string Note { get; }

    [JsonPropertyName("nodes")]
    [JsonPropertyOrder(5)]
    public IReadOnlyList<ProjectionNode> Nodes { get; }
}

internal sealed class ProjectionSourceSnapshot
{
    internal ProjectionSourceSnapshot(
        string? sourceRepo,
        string? sourceCommit,
        string? truthGraphSha256,
        string? blessedBy,
        string? approvedAt)
    {
        SourceRepo = sourceRepo;
        SourceCommit = sourceCommit;
        TruthGraphSha256 = truthGraphSha256;
        BlessedBy = blessedBy;
        ApprovedAt = approvedAt;
    }

    [JsonPropertyName("source_repo")]
    [JsonPropertyOrder(0)]
    public string? SourceRepo { get; }

    [JsonPropertyName("source_commit")]
    [JsonPropertyOrder(1)]
    public string? SourceCommit { get; }

    [JsonPropertyName("truth_graph_sha256")]
    [JsonPropertyOrder(2)]
    public string? TruthGraphSha256 { get; }

    [JsonPropertyName("blessed_by")]
    [JsonPropertyOrder(3)]
    public string? BlessedBy { get; }

    [JsonPropertyName("approved_at")]
    [JsonPropertyOrder(4)]
    public string? ApprovedAt { get; }
}

internal sealed class ProjectionCounts
{
    internal ProjectionCounts(
        int shown,
        int shownClosed,
        int shownOpen,
        int shownTail,
        int? dagClosed,
        int? dagOpen,
        int? dagTail,
        int? dagSemantic,
        int filteredNoGid,
        int edges)
    {
        Shown = shown;
        ShownClosed = shownClosed;
        ShownOpen = shownOpen;
        ShownTail = shownTail;
        DagClosed = dagClosed;
        DagOpen = dagOpen;
        DagTail = dagTail;
        DagSemantic = dagSemantic;
        FilteredNoGid = filteredNoGid;
        Edges = edges;
    }

    [JsonPropertyName("shown")]
    [JsonPropertyOrder(0)]
    public int Shown { get; }

    [JsonPropertyName("shown_closed")]
    [JsonPropertyOrder(1)]
    public int ShownClosed { get; }

    [JsonPropertyName("shown_open")]
    [JsonPropertyOrder(2)]
    public int ShownOpen { get; }

    [JsonPropertyName("shown_tail")]
    [JsonPropertyOrder(3)]
    public int ShownTail { get; }

    [JsonPropertyName("dag_closed")]
    [JsonPropertyOrder(4)]
    public int? DagClosed { get; }

    [JsonPropertyName("dag_open")]
    [JsonPropertyOrder(5)]
    public int? DagOpen { get; }

    [JsonPropertyName("dag_tail")]
    [JsonPropertyOrder(6)]
    public int? DagTail { get; }

    [JsonPropertyName("dag_semantic")]
    [JsonPropertyOrder(7)]
    public int? DagSemantic { get; }

    [JsonPropertyName("filtered_no_gid")]
    [JsonPropertyOrder(8)]
    public int FilteredNoGid { get; }

    [JsonPropertyName("edges")]
    [JsonPropertyOrder(9)]
    public int Edges { get; }
}

internal sealed class ProjectionNode
{
    internal ProjectionNode(
        string id,
        string title,
        string status,
        string summary,
        int? depth)
    {
        Id = id;
        Title = title;
        Status = status;
        Summary = summary;
        Depth = depth;
    }

    [JsonPropertyName("id")]
    [JsonPropertyOrder(0)]
    public string Id { get; }

    [JsonPropertyName("title")]
    [JsonPropertyOrder(1)]
    public string Title { get; }

    [JsonPropertyName("status")]
    [JsonPropertyOrder(2)]
    public string Status { get; }

    [JsonPropertyName("summary")]
    [JsonPropertyOrder(3)]
    public string Summary { get; }

    [JsonPropertyName("depth")]
    [JsonPropertyOrder(4)]
    public int? Depth { get; }
}
