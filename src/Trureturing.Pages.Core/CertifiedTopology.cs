using System.Text.Json;
using System.Text.Json.Serialization;

namespace Trureturing.Pages.Core;

public static class PagesTopologySchemas
{
    public const string CertifiedTopology = "trureturing.certified-topology.v1";
    public const string Algorithm = "trureturing-certified-topology-v1";
    public const string SiteView = "pages-certified-topology-view.v1";
}

public sealed record PagesTopologySemantics(
    [property: JsonRequired] string NodeSemantics,
    [property: JsonRequired] string EdgeSemantics,
    [property: JsonRequired] string DepthSemantics,
    [property: JsonRequired] string ComponentSemantics,
    [property: JsonRequired] string DominatorSemantics);

public sealed record PagesTopologySummary(
    [property: JsonRequired] int NodeCount,
    [property: JsonRequired] int EdgeCount,
    [property: JsonRequired] int RootCount,
    [property: JsonRequired] int LeafCount,
    [property: JsonRequired] int ComponentCount,
    [property: JsonRequired] int MaximumDepth);

public sealed record PagesCertifiedTopologyNode(
    [property: JsonRequired] string Id,
    [property: JsonRequired] string RepoPath,
    [property: JsonRequired] IReadOnlyList<string> Declarations,
    [property: JsonRequired] IReadOnlyList<string> PrerequisiteIds,
    [property: JsonRequired] IReadOnlyList<string> AxiomClosure,
    string? AxiomTier,
    string? DocumentAnchor,
    [property: JsonRequired] string ComponentId,
    [property: JsonRequired] int Depth,
    [property: JsonRequired] int Height,
    [property: JsonRequired] int InDegree,
    [property: JsonRequired] int OutDegree,
    [property: JsonRequired] int AncestorCount,
    [property: JsonRequired] int DescendantCount,
    [property: JsonRequired] int DominatedNodeCount,
    [property: JsonRequired] int StructuralBlastRadius,
    [property: JsonRequired] bool IsRoot,
    [property: JsonRequired] bool IsLeaf);

public sealed record PagesCertifiedTopologyEdge(
    [property: JsonRequired] string PrerequisiteId,
    [property: JsonRequired] string DependentId);

public sealed record PagesCertifiedTopologyComponent(
    [property: JsonRequired] string Id,
    [property: JsonRequired] int NodeCount,
    [property: JsonRequired] int EdgeCount,
    [property: JsonRequired] int MaximumDepth);

public sealed record PagesCertifiedTopology(
    [property: JsonRequired] string Schema,
    [property: JsonRequired] string SourceTruthReleaseDigest,
    [property: JsonRequired] string SourceCommit,
    [property: JsonRequired] string SourceTree,
    [property: JsonRequired] string Algorithm,
    [property: JsonRequired] PagesTopologySemantics Semantics,
    [property: JsonRequired] PagesTopologySummary Summary,
    [property: JsonRequired] IReadOnlyList<PagesCertifiedTopologyNode> Nodes,
    [property: JsonRequired] IReadOnlyList<PagesCertifiedTopologyEdge> Edges,
    [property: JsonRequired] IReadOnlyList<PagesCertifiedTopologyComponent> Components);

public sealed record PagesTopologyViewSnapshot(
    string SourceCommit,
    string SourceTree,
    string TruthReleaseDigest,
    string TopologyAlgorithm);

public sealed record PagesTopologyViewCounts(
    int Nodes,
    int Edges,
    int Roots,
    int Leaves,
    int Components,
    int MaximumDepth,
    int AdvisoryEdges);

public sealed record PagesTopologyViewNode(
    string Id,
    string Gid,
    string Title,
    string Status,
    string State,
    string Summary,
    int Depth,
    int TrueDepth,
    int Height,
    int InDegree,
    int OutDegree,
    int AncestorCount,
    int DescendantCount,
    int DominatedNodeCount,
    int StructuralBlastRadius,
    string RepoPath,
    string Layer,
    string Domain,
    string ComponentId,
    string? AxiomTier,
    IReadOnlyList<string> AxiomClosure,
    string? DocumentAnchor);

public sealed record PagesTopologyViewEdge(
    string Source,
    string Target,
    string Layer,
    string Status,
    string? RelationId);

public sealed record PagesCertifiedTopologyView(
    string SchemaVersion,
    bool Synthetic,
    PagesTopologyViewSnapshot SourceSnapshot,
    PagesTopologyViewCounts Counts,
    string Note,
    IReadOnlyList<PagesTopologyViewNode> Nodes,
    IReadOnlyList<PagesTopologyViewEdge> Edges);

public static class PagesCertifiedTopologyJson
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

    public static PagesCertifiedTopology Read(ReadOnlySpan<byte> bytes)
    {
        try
        {
            PagesCertifiedTopology topology = JsonSerializer.Deserialize<PagesCertifiedTopology>(bytes, Options)
                ?? throw new InvalidDataException("Certified topology is null.");
            Validate(topology);
            return topology;
        }
        catch (JsonException exception)
        {
            throw new InvalidDataException(
                $"Certified topology is invalid JSON: {exception.Message}",
                exception);
        }
    }

    public static byte[] Write<T>(T value) =>
        JsonSerializer.SerializeToUtf8Bytes(value, Options)
            .Concat(new byte[] { (byte)'\n' })
            .ToArray();

    public static void Validate(PagesCertifiedTopology topology)
    {
        ArgumentNullException.ThrowIfNull(topology);
        Require(topology.Schema == PagesTopologySchemas.CertifiedTopology,
            $"schema must be {PagesTopologySchemas.CertifiedTopology}.");
        Require(topology.Algorithm == PagesTopologySchemas.Algorithm,
            $"algorithm must be {PagesTopologySchemas.Algorithm}.");
        RequireSha256(topology.SourceTruthReleaseDigest, "source_truth_release_digest");
        RequireGitPair(topology.SourceCommit, topology.SourceTree);
        Require(topology.Semantics is not null, "semantics must be present.");
        Require(topology.Summary is not null, "summary must be present.");
        Require(topology.Nodes is not null, "nodes must be an array.");
        Require(topology.Edges is not null, "edges must be an array.");
        Require(topology.Components is not null, "components must be an array.");
        Require(topology.Nodes.All(node => node is not null), "nodes cannot contain null.");
        Require(topology.Edges.All(edge => edge is not null), "edges cannot contain null.");
        Require(topology.Components.All(component => component is not null),
            "components cannot contain null.");

        RequireUnique(topology.Nodes.Select(node => node.Id), "topology node id");
        RequireUnique(topology.Nodes.Select(node => node.RepoPath), "topology repo_path");
        RequireUnique(topology.Components.Select(component => component.Id), "component id");

        var ids = topology.Nodes.Select(node => node.Id)
            .ToHashSet(StringComparer.Ordinal);
        var componentIds = topology.Components.Select(component => component.Id)
            .ToHashSet(StringComparer.Ordinal);
        var edgeKeys = new HashSet<(string, string)>();
        var prerequisitesFromEdges = topology.Nodes.ToDictionary(
            node => node.Id,
            _ => new HashSet<string>(StringComparer.Ordinal),
            StringComparer.Ordinal);

        foreach (PagesCertifiedTopologyEdge edge in topology.Edges)
        {
            Require(ids.Contains(edge.PrerequisiteId),
                $"edge prerequisite {edge.PrerequisiteId} is absent.");
            Require(ids.Contains(edge.DependentId),
                $"edge dependent {edge.DependentId} is absent.");
            Require(edge.PrerequisiteId != edge.DependentId,
                "certified topology edge cannot be a self-loop.");
            Require(edgeKeys.Add((edge.PrerequisiteId, edge.DependentId)),
                $"duplicate certified edge {edge.PrerequisiteId} -> {edge.DependentId}.");
            prerequisitesFromEdges[edge.DependentId].Add(edge.PrerequisiteId);
        }

        foreach (PagesCertifiedTopologyNode node in topology.Nodes)
        {
            RequireSha256(node.Id, "topology node id");
            RequireNonEmpty(node.RepoPath, "topology repo_path");
            Require(node.Declarations is not null, $"node {node.Id} declarations must be an array.");
            Require(node.PrerequisiteIds is not null, $"node {node.Id} prerequisite_ids must be an array.");
            Require(node.AxiomClosure is not null, $"node {node.Id} axiom_closure must be an array.");
            RequireUnique(node.Declarations, $"declaration in {node.Id}");
            RequireUnique(node.PrerequisiteIds, $"prerequisite in {node.Id}");
            RequireUnique(node.AxiomClosure, $"axiom in {node.Id}");
            Require(componentIds.Contains(node.ComponentId),
                $"node {node.Id} references absent component {node.ComponentId}.");
            Require(node.Depth >= 0 && node.Height >= 0,
                $"node {node.Id} has negative depth or height.");
            Require(node.InDegree >= 0 && node.OutDegree >= 0 &&
                node.AncestorCount >= 0 && node.DescendantCount >= 0 &&
                node.DominatedNodeCount >= 0,
                $"node {node.Id} has a negative topology metric.");
            Require(node.StructuralBlastRadius == node.DescendantCount + 1,
                $"node {node.Id} blast radius is not descendant_count + 1.");
            Require(node.InDegree == node.PrerequisiteIds.Count,
                $"node {node.Id} in_degree disagrees with prerequisite_ids.");
            Require(node.IsRoot == (node.InDegree == 0),
                $"node {node.Id} root flag disagrees with in_degree.");
            Require(node.IsLeaf == (node.OutDegree == 0),
                $"node {node.Id} leaf flag disagrees with out_degree.");
            Require(prerequisitesFromEdges[node.Id].SetEquals(node.PrerequisiteIds),
                $"node {node.Id} prerequisite_ids disagree with certified edges.");
        }

        var byId = topology.Nodes.ToDictionary(node => node.Id, StringComparer.Ordinal);
        foreach (PagesCertifiedTopologyEdge edge in topology.Edges)
        {
            Require(byId[edge.PrerequisiteId].Depth < byId[edge.DependentId].Depth,
                $"edge {edge.PrerequisiteId} -> {edge.DependentId} violates true depth order.");
        }

        Require(topology.Summary.NodeCount == topology.Nodes.Count,
            "summary.node_count disagrees with nodes.");
        Require(topology.Summary.EdgeCount == topology.Edges.Count,
            "summary.edge_count disagrees with edges.");
        Require(topology.Summary.RootCount == topology.Nodes.Count(node => node.IsRoot),
            "summary.root_count disagrees with nodes.");
        Require(topology.Summary.LeafCount == topology.Nodes.Count(node => node.IsLeaf),
            "summary.leaf_count disagrees with nodes.");
        Require(topology.Summary.ComponentCount == topology.Components.Count,
            "summary.component_count disagrees with components.");
        int maximumDepth = topology.Nodes.Count == 0 ? 0 : topology.Nodes.Max(node => node.Depth);
        Require(topology.Summary.MaximumDepth == maximumDepth,
            "summary.maximum_depth disagrees with nodes.");
    }

    private static void RequireUnique(IEnumerable<string> values, string name)
    {
        var seen = new HashSet<string>(StringComparer.Ordinal);
        foreach (string value in values)
        {
            RequireNonEmpty(value, name);
            Require(seen.Add(value), $"duplicate {name}: {value}.");
        }
    }

    private static void RequireGitPair(string commit, string tree)
    {
        Require(IsGitObject(commit),
            "source_commit must be a lowercase 40- or 64-hex Git object id.");
        Require(IsGitObject(tree) && tree.Length == commit.Length,
            "source_tree must use the same Git object-id width as source_commit.");
    }

    private static bool IsGitObject(string value) =>
        value.Length is 40 or 64 && IsLowerHex(value);

    private static void RequireSha256(string value, string field)
    {
        Require(value.StartsWith("sha256:", StringComparison.Ordinal) &&
            value.Length == 71 && IsLowerHex(value["sha256:".Length..]),
            $"{field} must use sha256:<64hex>.");
    }

    private static bool IsLowerHex(string value) =>
        value.All(character => character is >= '0' and <= '9' or >= 'a' and <= 'f');

    private static void RequireNonEmpty(string? value, string field) =>
        Require(!string.IsNullOrWhiteSpace(value), $"{field} must be non-empty.");

    private static void Require(bool condition, string message)
    {
        if (!condition)
        {
            throw new InvalidDataException(message);
        }
    }
}

public static class PagesCertifiedTopologyProjection
{
    public static PagesCertifiedTopologyView Build(
        PagesCertifiedTopology topology,
        PagesIntuitionOverlay? overlay = null)
    {
        PagesCertifiedTopologyJson.Validate(topology);
        if (overlay is not null)
        {
            PagesPortJson.Validate(overlay);
            if (overlay.SourceTruthReleaseDigest != topology.SourceTruthReleaseDigest)
            {
                throw new InvalidDataException(
                    "Intuition overlay is bound to a different truth release than the topology.");
            }
        }

        IReadOnlyList<PagesTopologyViewNode> nodes = topology.Nodes
            .OrderBy(node => node.Id, StringComparer.Ordinal)
            .Select(node =>
            {
                (string layer, string domain) = DeriveLocation(node.RepoPath);
                string title = node.Declarations.Count == 0
                    ? node.RepoPath
                    : string.Join(", ", node.Declarations);
                return new PagesTopologyViewNode(
                    $"frozen:{node.Id}",
                    node.Id,
                    title,
                    "Closed",
                    "closed",
                    $"Closed · true depth {node.Depth} · blast radius {node.StructuralBlastRadius} · {node.RepoPath}",
                    node.Depth,
                    node.Depth,
                    node.Height,
                    node.InDegree,
                    node.OutDegree,
                    node.AncestorCount,
                    node.DescendantCount,
                    node.DominatedNodeCount,
                    node.StructuralBlastRadius,
                    node.RepoPath,
                    layer,
                    domain,
                    node.ComponentId,
                    node.AxiomTier,
                    node.AxiomClosure,
                    node.DocumentAnchor);
            })
            .ToArray();

        var edges = topology.Edges
            .OrderBy(edge => edge.PrerequisiteId, StringComparer.Ordinal)
            .ThenBy(edge => edge.DependentId, StringComparer.Ordinal)
            .Select(edge => new PagesTopologyViewEdge(
                $"frozen:{edge.PrerequisiteId}",
                $"frozen:{edge.DependentId}",
                "frozen-prerequisite",
                "certified",
                null))
            .ToList();

        if (overlay is not null)
        {
            var nodeIds = nodes.Select(node => node.Id).ToHashSet(StringComparer.Ordinal);
            foreach (PagesCandidateRelation relation in overlay.Relations
                .OrderBy(relation => relation.RelationId, StringComparer.Ordinal))
            {
                foreach (string input in relation.Inputs.Order(StringComparer.Ordinal))
                {
                    foreach (string output in relation.Outputs.Order(StringComparer.Ordinal))
                    {
                        if (!nodeIds.Contains(input) || !nodeIds.Contains(output))
                        {
                            throw new InvalidDataException(
                                $"Intuition relation {relation.RelationId} endpoint is absent from certified topology.");
                        }

                        edges.Add(new PagesTopologyViewEdge(
                            input,
                            output,
                            "intuition-candidate",
                            relation.Status,
                            relation.RelationId));
                    }
                }
            }
        }

        return new PagesCertifiedTopologyView(
            PagesTopologySchemas.SiteView,
            false,
            new PagesTopologyViewSnapshot(
                topology.SourceCommit,
                topology.SourceTree,
                topology.SourceTruthReleaseDigest,
                topology.Algorithm),
            new PagesTopologyViewCounts(
                topology.Summary.NodeCount,
                topology.Summary.EdgeCount,
                topology.Summary.RootCount,
                topology.Summary.LeafCount,
                topology.Summary.ComponentCount,
                topology.Summary.MaximumDepth,
                edges.Count(edge => edge.Layer == "intuition-candidate")),
            "Certified frozen-proof topology. Vertical position is true dependency depth; advisory Intuition edges never change certified metrics.",
            nodes,
            edges
                .OrderBy(edge => edge.Layer, StringComparer.Ordinal)
                .ThenBy(edge => edge.Source, StringComparer.Ordinal)
                .ThenBy(edge => edge.Target, StringComparer.Ordinal)
                .ToArray());
    }

    private static (string Layer, string Domain) DeriveLocation(string repoPath)
    {
        string normalized = repoPath.Replace('\\', '/');
        string[] segments = normalized.Split('/', StringSplitOptions.RemoveEmptyEntries);
        string layer = segments.Length >= 2 ? $"{segments[0]}/{segments[1]}" : "Root";
        string domain = segments.Length >= 3
            ? segments[2]
            : Path.GetFileNameWithoutExtension(normalized);
        return (layer, domain);
    }
}
