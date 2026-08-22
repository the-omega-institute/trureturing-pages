using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using System.Text.Encodings.Web;
using System.Text.Json;
using System.Text.Json.Serialization;
using Trureturing.Truth;

return ProjectorProgram.Run(args);

internal static class ProjectorProgram
{
    private static readonly IComparer<string> UnicodeCodePointComparer =
        Comparer<string>.Create(CompareUnicodeCodePoints);

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
        // System.Text.Json escapes supplementary runes as UTF-16 surrogate pairs;
        // Python's ensure_ascii=False emits the scalar directly as UTF-8.
        string output = UnescapeSupplementaryCodePoints(
            JsonSerializer.Serialize(result, OutputJsonOptions)) + "\n";
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
            .ThenBy(node => node.Id, UnicodeCodePointComparer)
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

    private static int CompareUnicodeCodePoints(string? left, string? right)
    {
        if (ReferenceEquals(left, right))
        {
            return 0;
        }

        if (left is null)
        {
            return -1;
        }

        if (right is null)
        {
            return 1;
        }

        StringRuneEnumerator leftRunes = left.EnumerateRunes();
        StringRuneEnumerator rightRunes = right.EnumerateRunes();
        while (leftRunes.MoveNext())
        {
            if (!rightRunes.MoveNext())
            {
                return 1;
            }

            int comparison = leftRunes.Current.Value.CompareTo(rightRunes.Current.Value);
            if (comparison != 0)
            {
                return comparison;
            }
        }

        return rightRunes.MoveNext() ? -1 : 0;
    }

    private static string UnescapeSupplementaryCodePoints(string json)
    {
        var output = new StringBuilder(json.Length);
        for (int index = 0; index < json.Length; index++)
        {
            if (index + 11 < json.Length &&
                json[index] == '\\' &&
                json[index + 1] == 'u' &&
                json[index + 6] == '\\' &&
                json[index + 7] == 'u' &&
                ushort.TryParse(
                    json.AsSpan(index + 2, 4),
                    NumberStyles.AllowHexSpecifier,
                    CultureInfo.InvariantCulture,
                    out ushort highSurrogate) &&
                ushort.TryParse(
                    json.AsSpan(index + 8, 4),
                    NumberStyles.AllowHexSpecifier,
                    CultureInfo.InvariantCulture,
                    out ushort lowSurrogate) &&
                Rune.TryCreate((char)highSurrogate, (char)lowSurrogate, out Rune rune))
            {
                output.Append(rune);
                index += 11;
                continue;
            }

            output.Append(json[index]);
            if (json[index] == '\\' && index + 1 < json.Length)
            {
                output.Append(json[++index]);
            }
        }

        return output.ToString();
    }
}

internal sealed record SourceSnapshot(
    string SourceRepo,
    string SourceCommit,
    string TruthGraphSha256,
    string BlessedBy,
    string DerivedAt)
{
    public static SourceSnapshot Read(byte[] bytes)
    {
        using JsonDocument document = JsonDocument.Parse(bytes);
        JsonElement root = document.RootElement;

        if (root.ValueKind != JsonValueKind.Object)
        {
            throw new InvalidDataException("source snapshot must be a JSON object");
        }

        string schema = GetRequiredString(root, "schema");
        if (schema != "source-snapshot.v1")
        {
            throw new InvalidDataException(
                "source snapshot field 'schema' must be 'source-snapshot.v1'");
        }

        GetRequiredString(root, "repo_identity");
        string sourceCommit = GetRequiredString(root, "source_commit");
        GetRequiredString(root, "source_tree");
        string derivedAt = GetRequiredString(root, "derived_at");
        ValidateDeriver(GetRequiredProperty(root, "deriver"));
        ValidateOpenSet(GetRequiredProperty(root, "open_set"));

        string truthGraphSha256 = GetRequiredString(root, "truth_graph_sha256");
        if (!IsLowerHex(truthGraphSha256, 64))
        {
            throw new InvalidDataException(
                "source snapshot field 'truth_graph_sha256' must be a 64-character " +
                "lowercase hexadecimal string");
        }

        return new SourceSnapshot(
            GetRequiredString(root, "source_repo"),
            sourceCommit,
            truthGraphSha256,
            GetRequiredString(root, "blessed_by"),
            derivedAt);
    }

    private static JsonElement GetRequiredProperty(JsonElement root, string name)
    {
        if (!root.TryGetProperty(name, out JsonElement value) || value.ValueKind == JsonValueKind.Null)
        {
            throw new InvalidDataException($"source snapshot field '{name}' is required");
        }

        return value;
    }

    private static string GetRequiredString(JsonElement root, string name)
    {
        JsonElement value = GetRequiredProperty(root, name);
        if (value.ValueKind != JsonValueKind.String)
        {
            throw new InvalidDataException($"source snapshot field '{name}' must be a string");
        }

        return value.GetString()!;
    }

    private static void ValidateDeriver(JsonElement deriver)
    {
        if (deriver.ValueKind != JsonValueKind.Object)
        {
            throw new InvalidDataException("source snapshot field 'deriver' must be an object");
        }

        GetRequiredString(deriver, "tool");
        GetRequiredString(deriver, "ref");
    }

    private static void ValidateOpenSet(JsonElement openSet)
    {
        if (openSet.ValueKind != JsonValueKind.Array)
        {
            throw new InvalidDataException("source snapshot field 'open_set' must be an array");
        }

        foreach (JsonElement item in openSet.EnumerateArray())
        {
            if (item.ValueKind != JsonValueKind.Object)
            {
                throw new InvalidDataException("source snapshot open_set entries must be objects");
            }

            GetRequiredString(item, "gid");
            JsonElement dependencies = GetRequiredProperty(item, "deps");
            if (dependencies.ValueKind != JsonValueKind.Array ||
                dependencies.EnumerateArray().Any(value => value.ValueKind != JsonValueKind.String))
            {
                throw new InvalidDataException(
                    "source snapshot open_set entry field 'deps' must be an array of strings");
            }

            JsonValueKind depsAllClosedKind =
                GetRequiredProperty(item, "deps_all_closed").ValueKind;
            if (depsAllClosedKind is not JsonValueKind.True and not JsonValueKind.False)
            {
                throw new InvalidDataException(
                    "source snapshot open_set entry field 'deps_all_closed' must be a boolean");
            }
        }
    }

    private static bool IsLowerHex(string value, int length) =>
        value.Length == length &&
        value.All(character =>
            character is >= '0' and <= '9' or >= 'a' and <= 'f');
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
