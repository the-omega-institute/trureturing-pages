using System.Security.Cryptography;
using System.Text;

namespace Trureturing.Pages.Core;

public sealed record PagesDagNode(
    string Id,
    string Kind,
    string Label,
    string State,
    string? RepoPath,
    string? MdbookPath);

public sealed record PagesDagEdge(
    string Id,
    string Source,
    string Target,
    string Layer,
    string Status);

public sealed record PagesDagRoot(
    string Schema,
    string ReleaseDigest,
    string SourceCommit,
    string SourceTree,
    int ModuleNodeCount,
    int FrozenNodeCount,
    int CertifiedEdgeCount,
    int AdvisoryEdgeCount,
    IReadOnlyList<PagesDagNode> Nodes,
    IReadOnlyList<PagesDagEdge> Edges,
    IReadOnlyDictionary<string, string> NeighborhoodFiles);

public sealed record PagesDagNeighborhood(
    string Schema,
    string ReleaseDigest,
    string CenterId,
    int Radius,
    IReadOnlyList<PagesDagNode> Nodes,
    IReadOnlyList<PagesDagEdge> Edges);

public sealed record PagesReleaseDelta(
    string Schema,
    string FromReleaseDigest,
    string ToReleaseDigest,
    IReadOnlyList<string> AddedModuleNodes,
    IReadOnlyList<string> RemovedModuleNodes,
    IReadOnlyList<string> AddedFrozenNodes,
    IReadOnlyList<string> RemovedFrozenNodes,
    IReadOnlyList<string> AddedCertifiedEdges,
    IReadOnlyList<string> RemovedCertifiedEdges);

public sealed record PagesDagArtifacts(
    PagesDagRoot Root,
    IReadOnlyDictionary<string, PagesDagNeighborhood> Neighborhoods);

public static class PagesDagProjection
{
    public const string RootSchema = "pages-dag-root.v1";
    public const string NeighborhoodSchema = "pages-dag-neighborhood.v1";
    public const string DeltaSchema = "pages-release-delta.v1";

    public static PagesDagArtifacts Build(
        PagesTruthReleasePort port,
        PagesIntuitionOverlay? overlay = null,
        int neighborhoodRadius = 1)
    {
        PagesPortJson.Validate(port, overlay);

        if (neighborhoodRadius < 1)
        {
            throw new ArgumentOutOfRangeException(
                nameof(neighborhoodRadius),
                "Neighborhood radius must be at least one.");
        }

        IReadOnlyList<PagesDagNode> nodes = BuildNodes(port);
        IReadOnlyList<PagesDagEdge> edges = BuildEdges(port, overlay);

        var neighborhoods = new SortedDictionary<string, PagesDagNeighborhood>(
            StringComparer.Ordinal);
        var neighborhoodFiles = new SortedDictionary<string, string>(
            StringComparer.Ordinal);

        foreach (PagesDagNode node in nodes.OrderBy(node => node.Id, StringComparer.Ordinal))
        {
            string fileName = $"neighborhood/{StableFileName(node.Id)}.json";
            neighborhoodFiles.Add(node.Id, fileName);
            neighborhoods.Add(
                fileName,
                BuildNeighborhood(
                    port.ReleaseDigest,
                    node.Id,
                    neighborhoodRadius,
                    nodes,
                    edges));
        }

        int certifiedEdges = edges.Count(edge => edge.Layer != "intuition-candidate");
        int advisoryEdges = edges.Count(edge => edge.Layer == "intuition-candidate");
        var root = new PagesDagRoot(
            RootSchema,
            port.ReleaseDigest,
            port.SourceCommit,
            port.SourceTree,
            port.ModuleNodes.Count,
            port.FrozenNodes.Count,
            certifiedEdges,
            advisoryEdges,
            nodes,
            edges,
            neighborhoodFiles);

        return new PagesDagArtifacts(root, neighborhoods);
    }

    public static PagesReleaseDelta Compare(
        PagesTruthReleasePort from,
        PagesTruthReleasePort to)
    {
        PagesPortJson.Validate(from);
        PagesPortJson.Validate(to);

        return new PagesReleaseDelta(
            DeltaSchema,
            from.ReleaseDigest,
            to.ReleaseDigest,
            Added(from.ModuleNodes.Select(node => node.Id),
                to.ModuleNodes.Select(node => node.Id)),
            Added(to.ModuleNodes.Select(node => node.Id),
                from.ModuleNodes.Select(node => node.Id)),
            Added(from.FrozenNodes.Select(node => node.FrozenNodeId),
                to.FrozenNodes.Select(node => node.FrozenNodeId)),
            Added(to.FrozenNodes.Select(node => node.FrozenNodeId),
                from.FrozenNodes.Select(node => node.FrozenNodeId)),
            Added(CertifiedEdgeKeys(from), CertifiedEdgeKeys(to)),
            Added(CertifiedEdgeKeys(to), CertifiedEdgeKeys(from)));
    }

    private static IReadOnlyList<PagesDagNode> BuildNodes(
        PagesTruthReleasePort port)
    {
        var anchors = port.DocumentAnchors.ToDictionary(
            anchor => anchor.NodeId,
            anchor => anchor.MdbookPath,
            StringComparer.Ordinal);

        var nodes = new List<PagesDagNode>(
            port.ModuleNodes.Count + port.FrozenNodes.Count);

        nodes.AddRange(port.ModuleNodes.Select(node => new PagesDagNode(
            ModuleId(node.Id),
            "module",
            node.Title,
            node.State,
            node.RepoPath,
            anchors.GetValueOrDefault(node.Id))));

        nodes.AddRange(port.FrozenNodes.Select(node => new PagesDagNode(
            FrozenId(node.FrozenNodeId),
            "frozen-proof",
            node.DeclarationIds.Count == 0
                ? node.RepoPath
                : string.Join(", ", node.DeclarationIds),
            "closed",
            node.RepoPath,
            null)));

        return nodes.OrderBy(node => node.Id, StringComparer.Ordinal).ToArray();
    }

    private static IReadOnlyList<PagesDagEdge> BuildEdges(
        PagesTruthReleasePort port,
        PagesIntuitionOverlay? overlay)
    {
        var edges = new List<PagesDagEdge>();

        edges.AddRange(port.ModuleEdges.Select(edge =>
        {
            string source = ModuleId(edge.Dependency);
            string target = ModuleId(edge.Dependent);
            return new PagesDagEdge(
                EdgeId("module-import", source, target),
                source,
                target,
                "module-import",
                "certified");
        }));

        edges.AddRange(port.FrozenEdges.Select(edge =>
        {
            string source = FrozenId(edge.PrerequisiteFrozenNodeId);
            string target = FrozenId(edge.DependentFrozenNodeId);
            return new PagesDagEdge(
                EdgeId("frozen-prerequisite", source, target),
                source,
                target,
                "frozen-prerequisite",
                "certified");
        }));

        if (overlay is not null)
        {
            foreach (PagesCandidateRelation relation in overlay.Relations)
            {
                foreach (string input in relation.Inputs)
                {
                    foreach (string output in relation.Outputs)
                    {
                        edges.Add(new PagesDagEdge(
                            $"intuition:{relation.RelationId}:{StableFileName(input + "->" + output)}",
                            input,
                            output,
                            "intuition-candidate",
                            relation.Status));
                    }
                }
            }
        }

        return edges
            .OrderBy(edge => edge.Layer, StringComparer.Ordinal)
            .ThenBy(edge => edge.Source, StringComparer.Ordinal)
            .ThenBy(edge => edge.Target, StringComparer.Ordinal)
            .ThenBy(edge => edge.Id, StringComparer.Ordinal)
            .ToArray();
    }

    private static PagesDagNeighborhood BuildNeighborhood(
        string releaseDigest,
        string centerId,
        int radius,
        IReadOnlyList<PagesDagNode> nodes,
        IReadOnlyList<PagesDagEdge> edges)
    {
        var adjacency = new Dictionary<string, HashSet<string>>(StringComparer.Ordinal);
        foreach (PagesDagNode node in nodes)
        {
            adjacency[node.Id] = new HashSet<string>(StringComparer.Ordinal);
        }

        foreach (PagesDagEdge edge in edges)
        {
            if (!adjacency.TryGetValue(edge.Source, out HashSet<string>? source) ||
                !adjacency.TryGetValue(edge.Target, out HashSet<string>? target))
            {
                continue;
            }

            source.Add(edge.Target);
            target.Add(edge.Source);
        }

        if (!adjacency.ContainsKey(centerId))
        {
            throw new InvalidDataException($"Unknown neighborhood center {centerId}.");
        }

        var distance = new Dictionary<string, int>(StringComparer.Ordinal)
        {
            [centerId] = 0
        };
        var queue = new Queue<string>();
        queue.Enqueue(centerId);

        while (queue.TryDequeue(out string? current))
        {
            int currentDistance = distance[current];
            if (currentDistance == radius)
            {
                continue;
            }

            foreach (string neighbor in adjacency[current]
                .OrderBy(value => value, StringComparer.Ordinal))
            {
                if (distance.TryAdd(neighbor, currentDistance + 1))
                {
                    queue.Enqueue(neighbor);
                }
            }
        }

        var included = distance.Keys.ToHashSet(StringComparer.Ordinal);
        return new PagesDagNeighborhood(
            NeighborhoodSchema,
            releaseDigest,
            centerId,
            radius,
            nodes.Where(node => included.Contains(node.Id))
                .OrderBy(node => node.Id, StringComparer.Ordinal)
                .ToArray(),
            edges.Where(edge =>
                    included.Contains(edge.Source) &&
                    included.Contains(edge.Target))
                .OrderBy(edge => edge.Id, StringComparer.Ordinal)
                .ToArray());
    }

    private static IReadOnlyList<string> CertifiedEdgeKeys(
        PagesTruthReleasePort port)
    {
        return port.ModuleEdges
            .Select(edge =>
                $"module-import:{edge.Dependency}->{edge.Dependent}")
            .Concat(port.FrozenEdges.Select(edge =>
                $"frozen-prerequisite:{edge.PrerequisiteFrozenNodeId}->{edge.DependentFrozenNodeId}"))
            .OrderBy(value => value, StringComparer.Ordinal)
            .ToArray();
    }

    private static IReadOnlyList<string> Added(
        IEnumerable<string> from,
        IEnumerable<string> to)
    {
        var prior = from.ToHashSet(StringComparer.Ordinal);
        return to.Where(value => !prior.Contains(value))
            .Distinct(StringComparer.Ordinal)
            .OrderBy(value => value, StringComparer.Ordinal)
            .ToArray();
    }

    private static string ModuleId(string id) => $"module:{id}";
    private static string FrozenId(string id) => $"frozen:{id}";

    private static string EdgeId(string layer, string source, string target) =>
        $"{layer}:{StableFileName(source + "->" + target)}";

    public static string StableFileName(string value) =>
        Convert.ToHexStringLower(
            SHA256.HashData(Encoding.UTF8.GetBytes(value)));
}
