using System.Text.Json;
using System.Text.Json.Serialization;

namespace Trureturing.Pages.Core;

public static class PagesSchemas
{
    public const string TruthReleasePort = "pages-truth-release-port.v1";
    public const string IntuitionOverlay = "pages-intuition-overlay.v1";
}

public sealed record PagesModuleNode(
    [property: JsonRequired] string Id,
    [property: JsonRequired] string Title,
    [property: JsonRequired] string State,
    [property: JsonRequired] int Depth,
    [property: JsonRequired] string RepoPath);

public sealed record PagesModuleEdge(
    [property: JsonRequired] string Dependency,
    [property: JsonRequired] string Dependent);

public sealed record PagesFrozenNode(
    [property: JsonRequired] string FrozenNodeId,
    [property: JsonRequired] string RepoPath,
    [property: JsonRequired] IReadOnlyList<string> DeclarationIds,
    [property: JsonRequired] IReadOnlyList<string> AxiomClosure);

public sealed record PagesFrozenEdge(
    [property: JsonRequired] string PrerequisiteFrozenNodeId,
    [property: JsonRequired] string DependentFrozenNodeId);

public sealed record PagesDocumentAnchor(
    [property: JsonRequired] string NodeId,
    [property: JsonRequired] string MdbookPath);

public sealed record PagesTruthReleasePort(
    [property: JsonRequired] string Schema,
    [property: JsonRequired] string ReleaseDigest,
    [property: JsonRequired] string SourceCommit,
    [property: JsonRequired] string SourceTree,
    [property: JsonRequired] IReadOnlyList<PagesModuleNode> ModuleNodes,
    [property: JsonRequired] IReadOnlyList<PagesModuleEdge> ModuleEdges,
    [property: JsonRequired] IReadOnlyList<PagesFrozenNode> FrozenNodes,
    [property: JsonRequired] IReadOnlyList<PagesFrozenEdge> FrozenEdges,
    [property: JsonRequired] IReadOnlyList<PagesDocumentAnchor> DocumentAnchors);

public sealed record PagesCandidateRelation(
    [property: JsonRequired] string RelationId,
    [property: JsonRequired] string RelationType,
    [property: JsonRequired] string Status,
    [property: JsonRequired] IReadOnlyList<string> Inputs,
    [property: JsonRequired] IReadOnlyList<string> Outputs,
    [property: JsonRequired] IReadOnlyList<string> EvidenceRefs);

public sealed record PagesIntuitionOverlay(
    [property: JsonRequired] string Schema,
    [property: JsonRequired] string SourceTruthReleaseDigest,
    [property: JsonRequired] IReadOnlyList<PagesCandidateRelation> Relations);

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

    public static PagesIntuitionOverlay ReadIntuitionOverlay(
        ReadOnlySpan<byte> bytes,
        PagesTruthReleasePort truthRelease)
    {
        PagesIntuitionOverlay overlay = Deserialize<PagesIntuitionOverlay>(bytes);
        Validate(truthRelease, overlay);
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

    public static void Validate(PagesTruthReleasePort port)
    {
        port = RequireNotNull(port, "truth release port");
        Require(port.Schema == PagesSchemas.TruthReleasePort,
            $"schema must be {PagesSchemas.TruthReleasePort}.");
        RequireSha256(port.ReleaseDigest, nameof(port.ReleaseDigest));
        RequireGitPair(port.SourceCommit, port.SourceTree);

        Require(port.ModuleNodes is not null, "module_nodes must be an array.");
        Require(port.ModuleEdges is not null, "module_edges must be an array.");
        Require(port.FrozenNodes is not null, "frozen_nodes must be an array.");
        Require(port.FrozenEdges is not null, "frozen_edges must be an array.");
        Require(port.DocumentAnchors is not null, "document_anchors must be an array.");
        RequireNoNullItems(port.ModuleNodes!, "module_nodes");
        RequireNoNullItems(port.ModuleEdges!, "module_edges");
        RequireNoNullItems(port.FrozenNodes!, "frozen_nodes");
        RequireNoNullItems(port.FrozenEdges!, "frozen_edges");
        RequireNoNullItems(port.DocumentAnchors!, "document_anchors");

        RequireUnique(port.ModuleNodes!.Select(node => node.Id), "module node id");
        RequireUnique(port.ModuleNodes!.Select(node => node.RepoPath), "module repo_path");
        RequireUnique(port.FrozenNodes!.Select(node => node.FrozenNodeId), "frozen node id");
        RequireUnique(port.FrozenNodes!.Select(node => node.RepoPath), "frozen repo_path");
        RequireUnique(port.DocumentAnchors!.Select(anchor => anchor.NodeId), "document anchor node id");

        var moduleIds = port.ModuleNodes!.Select(node => node.Id)
            .ToHashSet(StringComparer.Ordinal);
        foreach (PagesModuleNode node in port.ModuleNodes!)
        {
            RequireNonEmpty(node.Id, "module node id");
            RequireNonEmpty(node.Title, "module node title");
            RequireNonEmpty(node.RepoPath, "module node repo_path");
            Require(ModuleStates.Contains(node.State),
                $"module node {node.Id} has unknown state {node.State}.");
            Require(node.Depth >= 0, $"module node {node.Id} has negative depth.");
        }

        foreach (PagesModuleEdge edge in port.ModuleEdges!)
        {
            Require(moduleIds.Contains(edge.Dependency),
                $"module edge dependency {edge.Dependency} is absent.");
            Require(moduleIds.Contains(edge.Dependent),
                $"module edge dependent {edge.Dependent} is absent.");
            Require(edge.Dependency != edge.Dependent,
                "module edge cannot be a self-loop.");
        }

        RequireUniqueEdges(
            port.ModuleEdges!.Select(edge => (edge.Dependency, edge.Dependent)),
            "module edge");
        RequireAcyclic(
            moduleIds,
            port.ModuleEdges!.Select(edge => (edge.Dependency, edge.Dependent)),
            "module graph");

        var frozenIds = port.FrozenNodes!.Select(node => node.FrozenNodeId)
            .ToHashSet(StringComparer.Ordinal);
        foreach (PagesFrozenNode node in port.FrozenNodes!)
        {
            RequireSha256(node.FrozenNodeId, "frozen_node_id");
            RequireNonEmpty(node.RepoPath, "frozen node repo_path");
            RequireUnique(node.DeclarationIds, $"declaration id in {node.FrozenNodeId}");
            RequireUnique(node.AxiomClosure, $"axiom in {node.FrozenNodeId}");
        }

        foreach (PagesFrozenEdge edge in port.FrozenEdges!)
        {
            Require(frozenIds.Contains(edge.PrerequisiteFrozenNodeId),
                $"frozen prerequisite {edge.PrerequisiteFrozenNodeId} is absent.");
            Require(frozenIds.Contains(edge.DependentFrozenNodeId),
                $"frozen dependent {edge.DependentFrozenNodeId} is absent.");
            Require(edge.PrerequisiteFrozenNodeId != edge.DependentFrozenNodeId,
                "frozen proof edge cannot be a self-loop.");
        }

        RequireUniqueEdges(
            port.FrozenEdges!.Select(edge =>
                (edge.PrerequisiteFrozenNodeId, edge.DependentFrozenNodeId)),
            "frozen edge");
        RequireAcyclic(
            frozenIds,
            port.FrozenEdges!.Select(edge =>
                (edge.PrerequisiteFrozenNodeId, edge.DependentFrozenNodeId)),
            "frozen proof graph");

        foreach (PagesDocumentAnchor anchor in port.DocumentAnchors!)
        {
            Require(moduleIds.Contains(anchor.NodeId),
                $"document anchor node {anchor.NodeId} is absent.");
            RequireNonEmpty(anchor.MdbookPath, "mdbook path");
        }
    }

    public static void Validate(PagesIntuitionOverlay overlay)
    {
        overlay = RequireNotNull(overlay, "intuition overlay");
        Require(overlay.Schema == PagesSchemas.IntuitionOverlay,
            $"schema must be {PagesSchemas.IntuitionOverlay}.");
        RequireSha256(overlay.SourceTruthReleaseDigest, nameof(overlay.SourceTruthReleaseDigest));
        Require(overlay.Relations is not null, "relations must be an array.");
        RequireNoNullItems(overlay.Relations!, "relations");
        RequireUnique(overlay.Relations!.Select(relation => relation.RelationId), "relation id");

        foreach (PagesCandidateRelation relation in overlay.Relations!)
        {
            RequireNonEmpty(relation.RelationId, "relation id");
            RequireNonEmpty(relation.RelationType, "relation type");
            Require(CandidateStatuses.Contains(relation.Status),
                $"relation {relation.RelationId} has unknown status {relation.Status}.");
            Require(relation.Inputs is not null,
                $"relation {relation.RelationId} inputs must be an array.");
            Require(relation.Outputs is not null,
                $"relation {relation.RelationId} outputs must be an array.");
            Require(relation.EvidenceRefs is not null,
                $"relation {relation.RelationId} evidence_refs must be an array.");
            Require(relation.Inputs!.Count > 0, $"relation {relation.RelationId} has no inputs.");
            Require(relation.Outputs!.Count > 0, $"relation {relation.RelationId} has no outputs.");
            RequireUnique(relation.Inputs!, $"input in relation {relation.RelationId}");
            RequireUnique(relation.Outputs!, $"output in relation {relation.RelationId}");
            RequireUnique(relation.EvidenceRefs!, $"evidence ref in relation {relation.RelationId}");
        }
    }

    public static void Validate(
        PagesTruthReleasePort truthRelease,
        PagesIntuitionOverlay? overlay)
    {
        Validate(truthRelease);
        if (overlay is null)
        {
            return;
        }

        Validate(overlay);
        Require(overlay.SourceTruthReleaseDigest == truthRelease.ReleaseDigest,
            "intuition overlay is bound to a different truth release.");

        var certifiedNodeIds = truthRelease.ModuleNodes!.Select(node => $"module:{node.Id}")
            .Concat(truthRelease.FrozenNodes!.Select(node => $"frozen:{node.FrozenNodeId}"))
            .ToHashSet(StringComparer.Ordinal);

        foreach (PagesCandidateRelation relation in overlay.Relations!)
        {
            foreach (string endpoint in relation.Inputs!.Concat(relation.Outputs!))
            {
                Require(certifiedNodeIds.Contains(endpoint),
                    $"relation {relation.RelationId} endpoint {endpoint} is not a certified node.");
            }
        }
    }

    private static void RequireAcyclic(
        IReadOnlySet<string> nodeIds,
        IEnumerable<(string Source, string Target)> edges,
        string graphName)
    {
        var outgoing = nodeIds.ToDictionary(
            id => id,
            _ => new List<string>(),
            StringComparer.Ordinal);
        var indegree = nodeIds.ToDictionary(
            id => id,
            _ => 0,
            StringComparer.Ordinal);

        foreach ((string source, string target) in edges)
        {
            outgoing[source].Add(target);
            indegree[target]++;
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

        Require(visited == nodeIds.Count, $"{graphName} contains a cycle.");
    }

    private static void RequireGitPair(string? commit, string? tree)
    {
        Require(commit is not null && IsLowerHex(commit) && commit.Length is 40 or 64,
            "source_commit must be a lowercase 40- or 64-hex Git object id.");
        Require(tree is not null && commit is not null && IsLowerHex(tree) && tree.Length == commit.Length,
            "source_tree must use the same Git object-id width as source_commit.");
    }

    private static void RequireSha256(string? value, string field)
    {
        Require(value is not null && value.StartsWith("sha256:", StringComparison.Ordinal),
            $"{field} must use sha256:<64hex>.");
        string hex = value is null ? string.Empty : value["sha256:".Length..];
        Require(hex.Length == 64 && IsLowerHex(hex),
            $"{field} must use sha256:<64hex>.");
    }

    private static bool IsLowerHex(string? value) =>
        value is not null && value.All(character =>
            character is >= '0' and <= '9' or >= 'a' and <= 'f');

    private static void RequireUnique(IEnumerable<string?> values, string name)
    {
        var seen = new HashSet<string>(StringComparer.Ordinal);
        foreach (string? value in values)
        {
            RequireNonEmpty(value, name);
            Require(value is not null && seen.Add(value), $"duplicate {name}: {value}.");
        }
    }

    private static void RequireUniqueEdges(
        IEnumerable<(string Source, string Target)> edges,
        string name)
    {
        var seen = new HashSet<(string Source, string Target)>();
        foreach ((string source, string target) in edges)
        {
            Require(seen.Add((source, target)),
                $"duplicate {name}: {source} -> {target}.");
        }
    }

    private static void RequireNoNullItems<T>(IEnumerable<T> values, string field)
    {
        Require(values.All(value => value is not null),
            $"{field} cannot contain null items.");
    }

    private static void RequireNonEmpty(string? value, string field) =>
        Require(!string.IsNullOrWhiteSpace(value), $"{field} must be non-empty.");

    private static void Require(bool condition, string message)
    {
        if (!condition)
        {
            throw new InvalidDataException(message);
        }
    }

    private static T RequireNotNull<T>(T? value, string field)
        where T : class =>
        value ?? throw new InvalidDataException($"{field} must be non-null.");
}
