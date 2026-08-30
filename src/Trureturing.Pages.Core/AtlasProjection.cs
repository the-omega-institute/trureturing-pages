using System.Text.Json;
using System.Text.Json.Nodes;

namespace Trureturing.Pages.Core;

public static class PagesAtlasSchemas
{
    public const string SourceGraph = "pages-truth-release-dag.v1";
    public const string AtlasView = "pages-atlas-view.v1";
    public const string AtlasManifest = "pages-atlas-manifest.v1";
    public const string ProjectionProfile = "pages-atlas-projection-v1";
    public const string CertifiedTopology = "certified-topology.v1";
}

public sealed record PagesAtlasManifestCounts(
    int Nodes,
    int TruthNodes,
    int Edges,
    int CertifiedTopologyNodes);

public sealed record PagesAtlasManifest(
    string SchemaVersion,
    string TruthReleaseDigest,
    string SourceCommit,
    string SourceTree,
    string InputGraphDigest,
    string CertifiedTopologyDigest,
    string AtlasGraphDigest,
    string CertifiedTopologyProfileDigest,
    string TopologyProducerCommit,
    string? TopologyAtlasDigest,
    string? ConformationDigest,
    string ProjectionProfile,
    string GraphPath,
    IReadOnlyList<string> CompatibilityPaths,
    PagesAtlasManifestCounts Counts);

public sealed record PagesAtlasProjectionArtifacts(
    byte[] GraphBytes,
    byte[] ManifestBytes,
    PagesAtlasManifest Manifest);

public static class PagesAtlasProjection
{
    public const string CanonicalGraphPath =
        "data/pages-atlas-view.v1.json";

    public static readonly IReadOnlyList<string>
        CompatibilityGraphPaths =
        [
            "data/certified-topology-view.v1.json",
            "data/truth-graph.v1.json"
        ];

    public static PagesAtlasProjectionArtifacts Build(
        ReadOnlySpan<byte> graphBytes,
        ReadOnlySpan<byte> certifiedTopologyBytes)
    {
        using JsonDocument graphDocument = PagesStrictJson.Parse(
            graphBytes,
            "Pages source graph");
        using JsonDocument topologyDocument = PagesStrictJson.Parse(
            certifiedTopologyBytes,
            "certified topology");

        JsonObject graph = JsonNode.Parse(
            graphDocument.RootElement.GetRawText())?.AsObject()
            ?? throw new InvalidDataException(
                "Pages source graph is null.");
        PagesAtlasCertifiedTopology topology =
            PagesAtlasCertifiedTopologyReader.Read(
                topologyDocument.RootElement);

        ValidateSourceGraph(
            graphDocument.RootElement,
            graph,
            topology,
            out string truthReleaseDigest,
            out string sourceCommit,
            out string sourceTree,
            out JsonObject snapshot,
            out JsonObject counts,
            out JsonArray nodes,
            out JsonArray edges,
            out SortedDictionary<string, JsonObject>
                truthNodesByPath);

        foreach (PagesAtlasNodeMetrics metrics in topology.Nodes)
        {
            if (!truthNodesByPath.TryGetValue(
                    metrics.NodeId,
                    out JsonObject? node))
            {
                throw new InvalidDataException(
                    $"Certified topology node {metrics.NodeId} is absent " +
                    "from the Pages truth graph.");
            }

            AttachMetrics(node, metrics);
        }

        string inputGraphDigest =
            PagesStrictJson.Sha256(graphBytes);
        string certifiedTopologyDigest =
            PagesStrictJson.Sha256(certifiedTopologyBytes);

        graph["schema_version"] = PagesAtlasSchemas.AtlasView;
        graph["atlas_projection"] = new JsonObject
        {
            ["schema_version"] =
                PagesAtlasSchemas.AtlasManifest,
            ["projection_profile"] =
                PagesAtlasSchemas.ProjectionProfile,
            ["input_graph_digest"] = inputGraphDigest,
            ["certified_topology_digest"] =
                certifiedTopologyDigest,
            ["topology_atlas_digest"] = null,
            ["conformation_digest"] = null,
            ["manifest_path"] =
                "data/pages-atlas-manifest.v1.json"
        };

        snapshot["algorithm_profile_digest"] =
            topology.AlgorithmProfileDigest;
        snapshot["topology_producer_commit"] =
            topology.ProducerCommit;
        snapshot["certified_topology_digest"] =
            certifiedTopologyDigest;
        snapshot["atlas_projection_profile"] =
            PagesAtlasSchemas.ProjectionProfile;
        counts["certified_topology_nodes"] =
            topology.Nodes.Count;

        byte[] atlasGraphBytes =
            PagesStrictJson.SerializeNode(graph);
        var manifest = new PagesAtlasManifest(
            PagesAtlasSchemas.AtlasManifest,
            truthReleaseDigest,
            sourceCommit,
            sourceTree,
            inputGraphDigest,
            certifiedTopologyDigest,
            PagesStrictJson.Sha256(atlasGraphBytes),
            topology.AlgorithmProfileDigest,
            topology.ProducerCommit,
            null,
            null,
            PagesAtlasSchemas.ProjectionProfile,
            CanonicalGraphPath,
            CompatibilityGraphPaths,
            new PagesAtlasManifestCounts(
                nodes.Count,
                truthNodesByPath.Count,
                edges.Count,
                topology.Nodes.Count));
        byte[] manifestBytes =
            PagesStrictJson.SerializeValue(manifest);

        return new PagesAtlasProjectionArtifacts(
            atlasGraphBytes,
            manifestBytes,
            manifest);
    }

    private static void ValidateSourceGraph(
        JsonElement graphElement,
        JsonObject graph,
        PagesAtlasCertifiedTopology topology,
        out string truthReleaseDigest,
        out string sourceCommit,
        out string sourceTree,
        out JsonObject snapshot,
        out JsonObject counts,
        out JsonArray nodes,
        out JsonArray edges,
        out SortedDictionary<string, JsonObject>
            truthNodesByPath)
    {
        string schema = PagesStrictJson.RequiredString(
            graphElement,
            "schema_version",
            "$" );
        if (!StringComparer.Ordinal.Equals(
                schema,
                PagesAtlasSchemas.SourceGraph))
        {
            throw new InvalidDataException(
                $"Pages source graph schema must be {PagesAtlasSchemas.SourceGraph}.");
        }

        snapshot = PagesStrictJson.RequireObject(
            graph,
            "source_snapshot",
            "$" );
        truthReleaseDigest = PagesStrictJson.RequiredString(
            snapshot,
            "truth_release_digest",
            "$.source_snapshot");
        sourceCommit = PagesStrictJson.RequiredString(
            snapshot,
            "source_commit",
            "$.source_snapshot");
        sourceTree = PagesStrictJson.RequiredString(
            snapshot,
            "source_tree",
            "$.source_snapshot");
        PagesStrictJson.RequireSha256(
            truthReleaseDigest,
            "$.source_snapshot.truth_release_digest");
        PagesStrictJson.RequireGitPair(
            sourceCommit,
            sourceTree);

        if (!StringComparer.Ordinal.Equals(
                truthReleaseDigest,
                topology.TruthReleaseDigest))
        {
            throw new InvalidDataException(
                "Certified topology is bound to a different truth release.");
        }

        nodes = PagesStrictJson.RequireArray(
            graph,
            "nodes",
            "$" );
        edges = PagesStrictJson.RequireArray(
            graph,
            "edges",
            "$" );
        counts = PagesStrictJson.RequireObject(
            graph,
            "counts",
            "$" );
        truthNodesByPath =
            new SortedDictionary<string, JsonObject>(
                StringComparer.Ordinal);
        var nodeIds = new HashSet<string>(
            StringComparer.Ordinal);
        foreach (JsonNode? value in nodes)
        {
            if (value is not JsonObject node)
            {
                throw new InvalidDataException(
                    "$.nodes cannot contain a non-object value.");
            }

            string id = PagesStrictJson.RequiredString(
                node,
                "id",
                "$.nodes[]");
            if (!nodeIds.Add(id))
            {
                throw new InvalidDataException(
                    $"Pages source graph contains duplicate node id {id}.");
            }

            string kind = PagesStrictJson.RequiredString(
                node,
                "kind",
                $"$.nodes[{id}]");
            if (!StringComparer.Ordinal.Equals(
                    kind,
                    "truth"))
            {
                continue;
            }

            string repoPath =
                PagesStrictJson.RequiredString(
                    node,
                    "repo_path",
                    $"$.nodes[{id}]");
            if (!truthNodesByPath.TryAdd(
                    repoPath,
                    node))
            {
                throw new InvalidDataException(
                    $"Pages source graph contains duplicate truth repo_path {repoPath}.");
            }
        }

        if (truthNodesByPath.Count !=
            topology.Nodes.Count)
        {
            throw new InvalidDataException(
                "Certified topology node count does not close over the Pages truth nodes.");
        }
    }

    private static void AttachMetrics(
        JsonObject node,
        PagesAtlasNodeMetrics metrics)
    {
        node["in_degree"] = metrics.InDegree;
        node["out_degree"] = metrics.OutDegree;
        node["min_depth"] = metrics.MinDepth;
        node["max_depth"] = metrics.MaxDepth;
        node["true_depth"] = metrics.MaxDepth;
        node["ancestor_count"] = metrics.AncestorCount;
        node["descendant_count"] =
            metrics.DescendantCount;
        node["descendant_cost"] =
            metrics.DescendantCost;
        node["normalized_reach"] =
            metrics.NormalizedReach.ToString();
        node["dependency_betweenness"] =
            metrics.DependencyBetweenness.ToString();
        node["structure_source"] =
            PagesAtlasSchemas.CertifiedTopology;
    }
}
