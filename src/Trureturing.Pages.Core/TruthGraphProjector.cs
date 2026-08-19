using System.Globalization;
using System.Text;
using System.Text.Encodings.Web;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace Trureturing.Pages.Core;

public static class TruthGraphProjector
{
    private static readonly JsonSerializerOptions OutputOptions = new()
    {
        WriteIndented = true,
        Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping,
        DefaultIgnoreCondition = JsonIgnoreCondition.Never,
    };

    public static byte[] Project(
        ReadOnlySpan<byte> truthGraphUtf8,
        ReadOnlySpan<byte> sourceSnapshotUtf8)
    {
        using var truthGraph = StrictJson.Parse(truthGraphUtf8, "truth graph");
        using var sourceSnapshot = StrictJson.Parse(sourceSnapshotUtf8, "source snapshot");

        RequireObject(truthGraph.RootElement, "truth graph root");
        RequireObject(sourceSnapshot.RootElement, "source snapshot root");
        var truth = RequireObjectProperty(truthGraph.RootElement, "truth");
        var rawNodes = RequireArrayProperty(truth, "nodes");

        var rendered = new List<(int Rank, ProjectionNode Node)>();
        var filteredNoGid = 0;
        var shownClosed = 0;
        var shownOpen = 0;
        var shownTail = 0;

        foreach (var rawNode in rawNodes.EnumerateArray())
        {
            RequireObject(rawNode, "truth.nodes item");
            var state = OptionalString(rawNode, "state", "truth.nodes item");
            if (!IsMathState(state))
            {
                continue;
            }

            var gid = OptionalString(rawNode, "gid", "truth.nodes item");
            if (string.IsNullOrEmpty(gid))
            {
                filteredNoGid++;
                continue;
            }

            var status = StatusTitle(state!);
            var depth = OptionalInt32(rawNode, "depth", "truth.nodes item");
            var moduleName = OptionalString(rawNode, "module_name", "truth.nodes item");
            var repoPathText = PythonText(rawNode, "repo_path", missingValue: string.Empty);
            var depthText = depth?.ToString(CultureInfo.InvariantCulture) ?? "None";
            var summary = $"{status} · depth {depthText} · {repoPathText}".Trim();
            var node = new ProjectionNode(
                gid,
                string.IsNullOrEmpty(moduleName) ? gid : moduleName,
                status,
                summary,
                depth);
            rendered.Add((StatusRank(state!), node));

            switch (state)
            {
                case "closed":
                    shownClosed++;
                    break;
                case "open":
                    shownOpen++;
                    break;
                case "tail":
                    shownTail++;
                    break;
            }
        }

        var nodes = rendered
            .OrderBy(static item => item.Rank)
            .ThenBy(static item => item.Node.Id, StringComparer.Ordinal)
            .Select(static item => item.Node)
            .ToArray();
        var stateCounts = OptionalObjectProperty(truth, "state_counts");
        var edgeCount = OptionalArrayProperty(truth, "edges")?.GetArrayLength() ?? 0;
        var counts = new ProjectionCounts(
            nodes.Length,
            shownClosed,
            shownOpen,
            shownTail,
            OptionalInt32(stateCounts, "closed", "truth.state_counts"),
            OptionalInt32(stateCounts, "open", "truth.state_counts"),
            OptionalInt32(stateCounts, "tail", "truth.state_counts"),
            OptionalInt32(stateCounts, "semantic", "truth.state_counts"),
            filteredNoGid,
            edgeCount);
        var source = new ProjectionSourceSnapshot(
            OptionalString(sourceSnapshot.RootElement, "source_repo", "source snapshot"),
            OptionalString(sourceSnapshot.RootElement, "source_commit", "source snapshot"),
            OptionalString(sourceSnapshot.RootElement, "truth_graph_sha256", "source snapshot"),
            OptionalString(sourceSnapshot.RootElement, "blessed_by", "source snapshot"),
            OptionalString(sourceSnapshot.RootElement, "derived_at", "source snapshot"));
        var note =
            $"Showing {nodes.Length} of {nodes.Length + filteredNoGid} mathematical nodes; "
            + $"{filteredNoGid} carry no GID (the umbrella root module) and are not listed.";
        var model = new ProjectionDocument(source, counts, note, nodes);

        var text = JsonSerializer.Serialize(model, OutputOptions)
            .Replace("\r\n", "\n", StringComparison.Ordinal);
        return Encoding.UTF8.GetBytes(text + "\n");
    }

    private static bool IsMathState(string? state) =>
        state is "closed" or "open" or "tail";

    private static string StatusTitle(string state) => state switch
    {
        "closed" => "Closed",
        "open" => "Open",
        "tail" => "Tail",
        _ => char.ToUpperInvariant(state[0]) + state[1..],
    };

    private static int StatusRank(string state) => state switch
    {
        "open" => 0,
        "tail" => 1,
        "closed" => 2,
        _ => 9,
    };

    private static void RequireObject(JsonElement value, string label)
    {
        if (value.ValueKind != JsonValueKind.Object)
        {
            throw new ProjectionException($"{label} must be an object");
        }
    }

    private static JsonElement RequireObjectProperty(JsonElement parent, string propertyName)
    {
        if (!parent.TryGetProperty(propertyName, out var value)
            || value.ValueKind != JsonValueKind.Object)
        {
            throw new ProjectionException($"property '{propertyName}' must be an object");
        }

        return value;
    }

    private static JsonElement RequireArrayProperty(JsonElement parent, string propertyName)
    {
        if (!parent.TryGetProperty(propertyName, out var value)
            || value.ValueKind != JsonValueKind.Array)
        {
            throw new ProjectionException($"property '{propertyName}' must be an array");
        }

        return value;
    }

    private static JsonElement? OptionalObjectProperty(JsonElement parent, string propertyName)
    {
        if (!parent.TryGetProperty(propertyName, out var value))
        {
            return null;
        }

        if (value.ValueKind != JsonValueKind.Object)
        {
            throw new ProjectionException($"property '{propertyName}' must be an object");
        }

        return value;
    }

    private static JsonElement? OptionalArrayProperty(JsonElement parent, string propertyName)
    {
        if (!parent.TryGetProperty(propertyName, out var value))
        {
            return null;
        }

        if (value.ValueKind != JsonValueKind.Array)
        {
            throw new ProjectionException($"property '{propertyName}' must be an array");
        }

        return value;
    }

    private static string? OptionalString(
        JsonElement parent,
        string propertyName,
        string label)
    {
        if (!parent.TryGetProperty(propertyName, out var value)
            || value.ValueKind == JsonValueKind.Null)
        {
            return null;
        }

        if (value.ValueKind != JsonValueKind.String)
        {
            throw new ProjectionException($"{label}.{propertyName} must be a string or null");
        }

        return value.GetString();
    }

    private static int? OptionalInt32(
        JsonElement? parent,
        string propertyName,
        string label)
    {
        if (parent is null
            || !parent.Value.TryGetProperty(propertyName, out var value)
            || value.ValueKind == JsonValueKind.Null)
        {
            return null;
        }

        if (value.ValueKind != JsonValueKind.Number || !value.TryGetInt32(out var result))
        {
            throw new ProjectionException($"{label}.{propertyName} must be an integer or null");
        }

        return result;
    }

    private static int? OptionalInt32(
        JsonElement parent,
        string propertyName,
        string label) =>
        OptionalInt32((JsonElement?)parent, propertyName, label);

    private static string PythonText(
        JsonElement parent,
        string propertyName,
        string missingValue)
    {
        if (!parent.TryGetProperty(propertyName, out var value))
        {
            return missingValue;
        }

        return value.ValueKind switch
        {
            JsonValueKind.String => value.GetString() ?? string.Empty,
            JsonValueKind.Null => "None",
            _ => throw new ProjectionException(
                $"truth.nodes item.{propertyName} must be a string or null"),
        };
    }
}
