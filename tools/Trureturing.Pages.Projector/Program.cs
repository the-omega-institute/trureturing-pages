using System.Security.Cryptography;
using System.Text.Encodings.Web;
using System.Text.Json;
using System.Text.Json.Serialization;
using Trureturing.Truth;

return ProjectorProgram.Run(args);

internal static class ProjectorProgram
{
    private static readonly JsonSerializerOptions OutputJsonOptions = new()
    {
        Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping,
        WriteIndented = true,
    };

    public static int Run(string[] args)
    {
        if (args.Length is < 2 or > 4)
        {
            Console.Error.WriteLine(
                "usage: Trureturing.Pages.Projector <truth-graph.v1.json path> <output path> " +
                "[<source-snapshot path>] [<expected digest>]");
            return 2;
        }

        try
        {
            ProjectFiles(
                args[0],
                args[1],
                args.Length > 2 ? args[2] : null,
                args.Length > 3 ? args[3] : null);
            return 0;
        }
        catch (Exception error)
        {
            Console.Error.WriteLine(error.Message);
            return 1;
        }
    }

    private static void ProjectFiles(
        string truthGraphPath,
        string outputPath,
        string? sourceSnapshotPath,
        string? expectedDigest)
    {
        byte[] truthGraphBytes = File.ReadAllBytes(truthGraphPath);
        SourceSnapshot? snapshot = sourceSnapshotPath is null
            ? null
            : SourceSnapshot.Read(File.ReadAllBytes(sourceSnapshotPath));
        string actualDigest = Convert.ToHexStringLower(SHA256.HashData(truthGraphBytes));

        if (snapshot is not null && snapshot.TruthGraphSha256 != actualDigest)
        {
            throw new InvalidOperationException(
                $"raw truth-graph digest {actualDigest} does not match blessed " +
                $"truth_graph_sha256 {snapshot.TruthGraphSha256}");
        }

        if (expectedDigest is not null && expectedDigest != actualDigest)
        {
            throw new InvalidOperationException(
                $"raw truth-graph digest {actualDigest} does not match expected " +
                $"digest {expectedDigest} (inputs advanced past the trigger)");
        }

        TruthGraphExportModel truthGraph = TruthGraphJsonReader.Read(truthGraphBytes);
        DisplayProjection result = Project(truthGraph, snapshot);
        string output = JsonSerializer.Serialize(result, OutputJsonOptions) + "\n";
        File.WriteAllText(outputPath, output, new System.Text.UTF8Encoding(encoderShouldEmitUTF8Identifier: false));

        DisplayCounts counts = result.Counts;
        Console.WriteLine(
            $"projected {counts.Shown} shown math nodes " +
            $"(closed={counts.ShownClosed} open={counts.ShownOpen} tail={counts.ShownTail}; " +
            $"dag_closed={counts.DagClosed} filtered_no_gid={counts.FilteredNoGid}) -> {outputPath}");
    }

    private static DisplayProjection Project(TruthGraphExportModel truthGraph, SourceSnapshot? snapshot)
    {
        var mathNodes = truthGraph.Truth.Nodes
            .Where(node => node.Gid is not null && IsMathState(node.State))
            .Select(node =>
            {
                string status = DisplayStatus(node.State);
                return new DisplayNode(
                    node.Gid!,
                    node.ModuleName ?? node.Gid!,
                    status,
                    $"{status} · depth {node.Depth} · {node.RepoPath}".Trim(),
                    node.Depth);
            })
            .OrderBy(node => StatusRank(node.Status))
            .ThenBy(node => node.Id, StringComparer.Ordinal)
            .ToArray();

        int filteredNoGid = truthGraph.Truth.Nodes.Count(
            node => node.Gid is null && IsMathState(node.State));
        TruthGraphStateCounts stateCounts = truthGraph.Truth.StateCounts;
        var counts = new DisplayCounts(
            mathNodes.Length,
            mathNodes.Count(node => node.Status == "Closed"),
            mathNodes.Count(node => node.Status == "Open"),
            mathNodes.Count(node => node.Status == "Tail"),
            stateCounts.Closed,
            stateCounts.Open,
            stateCounts.Tail,
            stateCounts.Semantic,
            filteredNoGid,
            truthGraph.Truth.Edges.Count());

        var sourceBlock = new DisplaySourceSnapshot(
            snapshot?.SourceRepo,
            snapshot?.SourceCommit,
            snapshot?.TruthGraphSha256,
            snapshot?.BlessedBy,
            snapshot?.DerivedAt);

        return new DisplayProjection(
            "truth-graph.v1",
            false,
            sourceBlock,
            counts,
            $"Showing {mathNodes.Length} of {mathNodes.Length + filteredNoGid} mathematical nodes; " +
            $"{filteredNoGid} carry no GID (the umbrella root module) and are not listed.",
            mathNodes);
    }

    private static bool IsMathState(string state) => state is "closed" or "open" or "tail";

    private static string DisplayStatus(string state) => state switch
    {
        "closed" => "Closed",
        "open" => "Open",
        "tail" => "Tail",
        "semantic" => "Semantic",
        _ => char.ToUpperInvariant(state[0]) + state[1..],
    };

    private static int StatusRank(string status) => status switch
    {
        "Open" => 0,
        "Tail" => 1,
        "Closed" => 2,
        _ => 9,
    };
}

internal sealed record SourceSnapshot(
    string? SourceRepo,
    string? SourceCommit,
    string? TruthGraphSha256,
    string? BlessedBy,
    string? DerivedAt)
{
    public static SourceSnapshot Read(byte[] bytes)
    {
        using JsonDocument document = JsonDocument.Parse(bytes);
        JsonElement root = document.RootElement;
        return new SourceSnapshot(
            GetOptionalProperty(root, "source_repo"),
            GetOptionalProperty(root, "source_commit"),
            GetOptionalProperty(root, "truth_graph_sha256"),
            GetOptionalProperty(root, "blessed_by"),
            GetOptionalProperty(root, "derived_at"));
    }

    private static string? GetOptionalProperty(JsonElement root, string name) =>
        root.TryGetProperty(name, out JsonElement value) && value.ValueKind != JsonValueKind.Null
            ? value.GetString()
            : null;
}

internal sealed record DisplayProjection(
    [property: JsonPropertyName("schema_version")] string SchemaVersion,
    [property: JsonPropertyName("synthetic")] bool Synthetic,
    [property: JsonPropertyName("source_snapshot")] DisplaySourceSnapshot SourceSnapshot,
    [property: JsonPropertyName("counts")] DisplayCounts Counts,
    [property: JsonPropertyName("note")] string Note,
    [property: JsonPropertyName("nodes")] IReadOnlyList<DisplayNode> Nodes);

internal sealed record DisplaySourceSnapshot(
    [property: JsonPropertyName("source_repo")] string? SourceRepo,
    [property: JsonPropertyName("source_commit")] string? SourceCommit,
    [property: JsonPropertyName("truth_graph_sha256")] string? TruthGraphSha256,
    [property: JsonPropertyName("blessed_by")] string? BlessedBy,
    [property: JsonPropertyName("approved_at")] string? ApprovedAt);

internal sealed record DisplayCounts(
    [property: JsonPropertyName("shown")] int Shown,
    [property: JsonPropertyName("shown_closed")] int ShownClosed,
    [property: JsonPropertyName("shown_open")] int ShownOpen,
    [property: JsonPropertyName("shown_tail")] int ShownTail,
    [property: JsonPropertyName("dag_closed")] int DagClosed,
    [property: JsonPropertyName("dag_open")] int DagOpen,
    [property: JsonPropertyName("dag_tail")] int DagTail,
    [property: JsonPropertyName("dag_semantic")] int DagSemantic,
    [property: JsonPropertyName("filtered_no_gid")] int FilteredNoGid,
    [property: JsonPropertyName("edges")] int Edges);

internal sealed record DisplayNode(
    [property: JsonPropertyName("id")] string Id,
    [property: JsonPropertyName("title")] string Title,
    [property: JsonPropertyName("status")] string Status,
    [property: JsonPropertyName("summary")] string Summary,
    [property: JsonPropertyName("depth")] int Depth);
