using System.Text.Json;
using System.Text.Json.Serialization;

namespace Trureturing.Pages.Core;

public static class PagesSchemas
{
    public const string TruthReleasePort = "pages-truth-release-port.v1";
    public const string IntuitionOverlay = "pages-intuition-overlay.v1";
}

public sealed record PagesModuleNode(
    string Id,
    string Title,
    string State,
    int Depth,
    string RepoPath);

public sealed record PagesModuleEdge(
    string Dependency,
    string Dependent);

public sealed record PagesFrozenNode(
    string FrozenNodeId,
    string RepoPath,
    IReadOnlyList<string> DeclarationIds,
    IReadOnlyList<string> AxiomClosure);

public sealed record PagesFrozenEdge(
    string PrerequisiteFrozenNodeId,
    string DependentFrozenNodeId);

public sealed record PagesDocumentAnchor(
    string NodeId,
    string MdbookPath);

public sealed record PagesTruthReleasePort(
    string Schema,
    string ReleaseDigest,
    string SourceCommit,
    string SourceTree,
    IReadOnlyList<PagesModuleNode> ModuleNodes,
    IReadOnlyList<PagesModuleEdge> ModuleEdges,
    IReadOnlyList<PagesFrozenNode> FrozenNodes,
    IReadOnlyList<PagesFrozenEdge> FrozenEdges,
    IReadOnlyList<PagesDocumentAnchor> DocumentAnchors);

public sealed record PagesCandidateRelation(
    string RelationId,
    string RelationType,
    string Status,
    IReadOnlyList<string> Inputs,
    IReadOnlyList<string> Outputs,
    IReadOnlyList<string> EvidenceRefs);

public sealed record PagesIntuitionOverlay(
    string Schema,
    string SourceTruthReleaseDigest,
    IReadOnlyList<PagesCandidateRelation> Relations);

public static class PagesPortJson
{
    private static readonly JsonSerializerOptions Options = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower,
        PropertyNameCaseInsensitive = false,
        UnmappedMemberHandling = JsonUnmappedMemberHandling.Disallow,
        AllowTrailingCommas = false,
        ReadCommentHandling = JsonCommentHandling.Disallow,
        WriteIndented = true
    };

    private static readonly HashSet<string> ModuleStates =
        new(StringComparer.Ordinal) { "closed", "open", "tail", "semantic" };

    private static readonly HashSet<string> CandidateStatuses =
        new(StringComparer.Ordinal)
        {
            "proposed",
            "evidence-backed",
            "under-verification",
            "proved",
            "refuted",
            "wall",
            "duplicate",
            "trivial",
            "open"
        };

    public static PagesTruthReleasePort ReadTruthReleasePort(ReadOnlySpan<byte> bytes)
    {
        PagesTruthReleasePort port = Deserialize<PagesTruthReleasePort>(bytes);
        Validate(port);
        return port;
    }

    public static PagesIntuitionOverlay ReadIntuitionOverlay(ReadOnlySpan<byte> bytes)
    {
        PagesIntuitionOverlay overlay = Deserialize<PagesIntuitionOverlay>(bytes);
        Validate(overlay);
        return overlay;
    }

    public static byte[] Write<T>(T value) =>
        JsonSerializer.SerializeToUtf8Bytes(value, Options)
            .Concat(new byte[] { (byte)'\n' })
            .ToArray();

    private static T Deserialize<T>(ReadOnlySpan<byte> bytes)
    {
        try
        {
            return JsonSerializer.Deserialize<T>(bytes, Options)
                ?? throw new InvalidDataException($"{typeof(T).Name} is null.");
        }
        catch (JsonException exception)
        {
            throw new InvalidDataException(
                $"{typeof(T).Name} is invalid JSON: {exception.Message}",
                exception);
        }
    }

    private static void Validate(PagesTruthReleasePort port)
    {
        Require(port.Schema == PagesSchemas.TruthReleasePort,
            $"schema must be {PagesSchemas.TruthReleasePort}.");
        RequireSha256(port.ReleaseDigest, nameof(port.ReleaseDigest));
        RequireGitPair(port.SourceCommit, port.SourceTree);

        RequireUnique(port.ModuleNodes.Select(node => node.Id), "module node id");
        RequireUnique(port.ModuleNodes.Select(node => node.RepoPath), "module repo_path");
        RequireUnique(port.FrozenNodes.Select(node => node.FrozenNodeId), "frozen node id");
        RequireUnique(port.FrozenNodes.Select(node => node.RepoPath), "frozen repo_path");
        RequireUnique(port.DocumentAnchors.Select(anchor => anchor.NodeId), "document anchor node id");

        var moduleIds = port.ModuleNodes.Select(node => node.Id)
            .ToHashSet(StringComparer.Ordinal);
        foreach (PagesModuleNode node in port.ModuleNodes)
        {
            RequireNonEmpty(node.Id, "module node id");
            RequireNonEmpty(node.Title, "module node title");
            RequireNonEmpty(node.RepoPath, "module node repo_path");
            Require(ModuleStates.Contains(node.State),
                $"module node {node.Id} has unknown state {node.State}.");
            Require(node.Depth >= 0, $"module node {node.Id} has negative depth.");
        }

        foreach (PagesModuleEdge edge in port.ModuleEdges)
        {
            Require(moduleIds.Contains(edge.Dependency),
                $"module edge dependency {edge.Dependency} is absent.");
            Require(moduleIds.Contains(edge.Dependent),
                $"module edge dependent {edge.Dependent} is absent.");
        }

        var frozenIds = port.FrozenNodes.Select(node => node.FrozenNodeId)
            .ToHashSet(StringComparer.Ordinal);
        foreach (PagesFrozenNode node in port.FrozenNodes)
        {
            RequireSha256(node.FrozenNodeId, "frozen_node_id");
            RequireNonEmpty(node.RepoPath, "frozen node repo_path");
            RequireUnique(node.DeclarationIds, $"declaration id in {node.FrozenNodeId}");
            RequireUnique(node.AxiomClosure, $"axiom in {node.FrozenNodeId}");
        }

        foreach (PagesFrozenEdge edge in port.FrozenEdges)
        {
            Require(frozenIds.Contains(edge.PrerequisiteFrozenNodeId),
                $"frozen prerequisite {edge.PrerequisiteFrozenNodeId} is absent.");
            Require(frozenIds.Contains(edge.DependentFrozenNodeId),
                $"frozen dependent {edge.DependentFrozenNodeId} is absent.");
            Require(edge.PrerequisiteFrozenNodeId != edge.DependentFrozenNodeId,
                "frozen proof edge cannot be a self-loop.");
        }

        RequireAcyclic(frozenIds, port.FrozenEdges);

        foreach (PagesDocumentAnchor anchor in port.DocumentAnchors)
        {
            Require(moduleIds.Contains(anchor.NodeId),
                $"document anchor node {anchor.NodeId} is absent.");
            RequireNonEmpty(anchor.MdbookPath, "mdbook path");
        }
    }

    private static void Validate(PagesIntuitionOverlay overlay)
    {
        Require(overlay.Schema == PagesSchemas.IntuitionOverlay,
            $"schema must be {PagesSchemas.IntuitionOverlay}.");
        RequireSha256(overlay.SourceTruthReleaseDigest, nameof(overlay.SourceTruthReleaseDigest));
        RequireUnique(overlay.Relations.Select(relation => relation.RelationId), "relation id");

        foreach (PagesCandidateRelation relation in overlay.Relations)
        {
            RequireNonEmpty(relation.RelationId, "relation id");
            RequireNonEmpty(relation.RelationType, "relation type");
            Require(CandidateStatuses.Contains(relation.Status),
                $"relation {relation.RelationId} has unknown status {relation.Status}.");
            Require(relation.Inputs.Count > 0, $"relation {relation.RelationId} has no inputs.");
            Require(relation.Outputs.Count > 0, $"relation {relation.RelationId} has no outputs.");
        }
    }

    private static void RequireAcyclic(
        IReadOnlySet<string> frozenIds,
        IReadOnlyList<PagesFrozenEdge> edges)
    {
        var outgoing = frozenIds.ToDictionary(
            id => id,
            _ => new List<string>(),
            StringComparer.Ordinal);
        var indegree = frozenIds.ToDictionary(
            id => id,
            _ => 0,
            StringComparer.Ordinal);

        foreach (PagesFrozenEdge edge in edges)
        {
            outgoing[edge.PrerequisiteFrozenNodeId].Add(edge.DependentFrozenNodeId);
            indegree[edge.DependentFrozenNodeId]++;
        }

        var queue = new PriorityQueue<string, string>(StringComparer.Ordinal);
        foreach ((string id, int degree) in indegree)
        {
            if (degree == 0)
            {
                queue.Enqueue(id, id);
            }
        }

        int visited = 0;
        while (queue.TryDequeue(out string? id, out _))
        {
            visited++;
            foreach (string dependent in outgoing[id])
            {
                indegree[dependent]--;
                if (indegree[dependent] == 0)
                {
                    queue.Enqueue(dependent, dependent);
                }
            }
        }

        Require(visited == frozenIds.Count, "frozen proof graph contains a cycle.");
    }

    private static void RequireGitPair(string commit, string tree)
    {
        Require(IsLowerHex(commit) && commit.Length is 40 or 64,
            "source_commit must be a lowercase 40- or 64-hex Git object id.");
        Require(IsLowerHex(tree) && tree.Length == commit.Length,
            "source_tree must use the same Git object-id width as source_commit.");
    }

    private static void RequireSha256(string value, string field)
    {
        Require(value.StartsWith("sha256:", StringComparison.Ordinal),
            $"{field} must use sha256:<64hex>.");
        string hex = value["sha256:".Length..];
        Require(hex.Length == 64 && IsLowerHex(hex),
            $"{field} must use sha256:<64hex>.");
    }

    private static bool IsLowerHex(string value) =>
        value.All(character =>
            character is >= '0' and <= '9' or >= 'a' and <= 'f');

    private static void RequireUnique(IEnumerable<string> values, string name)
    {
        var seen = new HashSet<string>(StringComparer.Ordinal);
        foreach (string value in values)
        {
            RequireNonEmpty(value, name);
            Require(seen.Add(value), $"duplicate {name}: {value}.");
        }
    }

    private static void RequireNonEmpty(string value, string field) =>
        Require(!string.IsNullOrWhiteSpace(value), $"{field} must be non-empty.");

    private static void Require(bool condition, string message)
    {
        if (!condition)
        {
            throw new InvalidDataException(message);
        }
    }
}
