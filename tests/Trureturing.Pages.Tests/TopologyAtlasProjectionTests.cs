using System.Security.Cryptography;
using System.Text.Json;
using System.Text.Json.Nodes;
using Trureturing.Pages.Core;
using Xunit;

namespace Trureturing.Pages.Tests;

public sealed class TopologyAtlasProjectionTests
{
    [Fact]
    public void ProjectsStructureWithoutPromotingAffinityToProof()
    {
        byte[] graphBytes = GraphBytes();
        byte[] topologyBytes = TopologyBytes();
        byte[] atlasBytes = AtlasBytes(topologyBytes);

        PagesAtlasProjectionArtifacts artifacts =
            PagesTopologyAtlasProjection.Build(
                graphBytes,
                topologyBytes,
                atlasBytes);

        Assert.Equal(Digest(atlasBytes), artifacts.Manifest.TopologyAtlasDigest);
        Assert.Equal(4, artifacts.Manifest.Counts.Edges);

        using JsonDocument graph = JsonDocument.Parse(artifacts.GraphBytes);
        JsonElement root = graph.RootElement;
        Assert.Equal("topology-atlas.v1", root.GetProperty("topology_atlas")
            .GetProperty("schema_version").GetString());
        Assert.Equal(4, root.GetProperty("clusters").GetArrayLength());
        Assert.Equal(3, root.GetProperty("cluster_hierarchy").GetArrayLength());

        JsonElement bridge = Assert.Single(
            root.GetProperty("nodes").EnumerateArray(),
            node => node.GetProperty("id").GetString() == "B");
        Assert.Equal("bridge", bridge.GetProperty("structural_role").GetString());
        Assert.Equal(CommunityOne, bridge.GetProperty("atlas_cluster_id").GetString());
        Assert.Equal("topology-atlas.v1", bridge.GetProperty("atlas_structure_source").GetString());

        JsonElement cutBridge = Assert.Single(
            root.GetProperty("edges").EnumerateArray(),
            edge => edge.GetProperty("source").GetString() == "B" &&
                edge.GetProperty("target").GetString() == "C");
        Assert.True(cutBridge.GetProperty("is_cut_bridge").GetBoolean());
        Assert.Equal("inter-cluster", cutBridge.GetProperty("cluster_relation").GetString());

        JsonElement affinity = Assert.Single(
            root.GetProperty("edges").EnumerateArray(),
            edge => edge.GetProperty("layer").GetString() == "structural-affinity");
        Assert.Equal("derived", affinity.GetProperty("status").GetString());
        Assert.Equal("deterministic-derived", affinity.GetProperty("authority").GetString());
        Assert.False(affinity.GetProperty("direct_dependency").GetBoolean());
    }

    [Fact]
    public void BuildsDeterministicTopologyAtlasConformation()
    {
        byte[] graphBytes = GraphBytes();
        byte[] topologyBytes = TopologyBytes();
        PagesAtlasProjectionArtifacts projection =
            PagesTopologyAtlasProjection.Build(
                graphBytes,
                topologyBytes,
                AtlasBytes(topologyBytes));

        PagesConformationArtifacts first = PagesTopologyAtlasConformation.Build(
            projection.GraphBytes,
            projection.ManifestBytes);
        PagesConformationArtifacts second = PagesTopologyAtlasConformation.Build(
            projection.GraphBytes,
            projection.ManifestBytes);

        Assert.Equal(first.ConformationBytes, second.ConformationBytes);
        Assert.Equal(first.BoundManifestBytes, second.BoundManifestBytes);
        Assert.Equal("topology-atlas.v1", first.Conformation.StructureSource);
        Assert.Equal(
            PagesTopologyAtlasConformationSchemas.LayoutProfile,
            first.Conformation.LayoutProfile.Name);
        Assert.StartsWith("sha256:", first.ConformationDigest, StringComparison.Ordinal);

        Dictionary<string, PagesConformationNode> nodes = first.Conformation.Nodes
            .ToDictionary(node => node.NodeId, StringComparer.Ordinal);
        Assert.Equal(CommunityOne, nodes["A"].RegionId);
        Assert.Equal(CommunityOne, nodes["B"].RegionId);
        Assert.Equal(CommunityTwo, nodes["C"].RegionId);
        Assert.Equal(0, nodes["A"].Aligned.Y);
        Assert.Equal(PagesTopologyAtlasConformationSchemas.DepthStep, nodes["B"].Aligned.Y);
        Assert.Equal(2 * PagesTopologyAtlasConformationSchemas.DepthStep, nodes["C"].Aligned.Y);
        Assert.Contains(first.Conformation.Regions, region =>
            region.RegionId == CommunityOne &&
            region.Authority == "topology-atlas-derived");
        Assert.Contains(first.Conformation.Regions, region =>
            region.Authority == "pages-derived-fallback");

        using JsonDocument bound = JsonDocument.Parse(first.BoundManifestBytes);
        Assert.Equal(first.ConformationDigest,
            bound.RootElement.GetProperty("conformation_digest").GetString());
    }

    [Fact]
    public void RejectsMixedCertifiedBytesAndIncompleteAtlasClosure()
    {
        byte[] graphBytes = GraphBytes();
        byte[] topologyBytes = TopologyBytes();
        JsonObject mixed = Atlas(topologyBytes);
        mixed["certified_topology_digest"] = "sha256:" + new string('9', 64);
        InvalidDataException binding = Assert.Throws<InvalidDataException>(() =>
            PagesTopologyAtlasProjection.Build(
                graphBytes,
                topologyBytes,
                Bytes(mixed)));
        Assert.Contains("different certified topology bytes", binding.Message,
            StringComparison.OrdinalIgnoreCase);

        JsonObject incomplete = Atlas(topologyBytes);
        JsonArray nodes = incomplete["node_structure"]!.AsArray();
        nodes[2]!["node_id"] = "Missing.lean";
        InvalidDataException closure = Assert.Throws<InvalidDataException>(() =>
            PagesTopologyAtlasProjection.Build(
                graphBytes,
                topologyBytes,
                Bytes(incomplete)));
        Assert.Contains("unknown node", closure.Message,
            StringComparison.OrdinalIgnoreCase);
    }

    private static byte[] GraphBytes() => Bytes(new JsonObject
    {
        ["schema_version"] = "pages-truth-release-dag.v1",
        ["source_snapshot"] = new JsonObject
        {
            ["source_commit"] = new string('1', 40),
            ["source_tree"] = new string('2', 40),
            ["truth_release_digest"] = ReleaseDigest
        },
        ["counts"] = new JsonObject(),
        ["nodes"] = new JsonArray(
            GraphNode("A", "A.lean", "D5/S0", "Alpha", 0, "closed"),
            GraphNode("B", "B.lean", "D5/S1", "Alpha", 1, "closed"),
            GraphNode("C", "C.lean", "D5/X_Frontier", "Gamma", 2, "open"),
            new JsonObject
            {
                ["id"] = "blueprint:A",
                ["kind"] = "blueprint",
                ["repo_path"] = "Blueprint/A.md",
                ["layer"] = "Blueprint",
                ["domain"] = "Document",
                ["depth"] = 0,
                ["state"] = "semantic"
            }),
        ["edges"] = new JsonArray(
            Edge("A", "B", "truth-dependency"),
            Edge("B", "C", "truth-dependency"),
            Edge("blueprint:A", "A", "blueprint-truth-anchor"))
    });

    private static JsonObject GraphNode(
        string id,
        string path,
        string layer,
        string domain,
        int depth,
        string state) => new()
    {
        ["id"] = id,
        ["kind"] = "truth",
        ["repo_path"] = path,
        ["layer"] = layer,
        ["domain"] = domain,
        ["depth"] = depth,
        ["state"] = state,
        ["status"] = char.ToUpperInvariant(state[0]) + state[1..],
        ["human_title"] = id
    };

    private static JsonObject Edge(string source, string target, string layer) => new()
    {
        ["source"] = source,
        ["target"] = target,
        ["layer"] = layer
    };

    private static byte[] TopologyBytes() => Bytes(new JsonObject
    {
        ["schema_version"] = "certified-topology.v1",
        ["truth_release_digest"] = ReleaseDigest,
        ["algorithm_profile_digest"] = CertifiedProfileDigest,
        ["producer_commit"] = new string('4', 40),
        ["nodes"] = new JsonArray(
            TopologyNode("A.lean", 0, 1, 0, 0, 0, 2, 8, 1, 1, 0, 1),
            TopologyNode("B.lean", 1, 1, 1, 1, 1, 1, 4, 1, 2, 1, 1),
            TopologyNode("C.lean", 1, 0, 2, 2, 2, 0, 1, 0, 1, 0, 1)),
        ["cycle_certificate"] = new JsonObject
        {
            ["status"] = "acyclic",
            ["cycles"] = new JsonArray()
        },
        ["dangling_reference_certificate"] = new JsonObject
        {
            ["status"] = "complete",
            ["dangling_references"] = new JsonArray()
        }
    });

    private static JsonObject TopologyNode(
        string id,
        int inDegree,
        int outDegree,
        int minDepth,
        int maxDepth,
        int ancestors,
        int descendants,
        int cost,
        int reachN,
        int reachD,
        int betweenN,
        int betweenD) => new()
    {
        ["node_id"] = id,
        ["in_degree"] = inDegree,
        ["out_degree"] = outDegree,
        ["min_depth"] = minDepth,
        ["max_depth"] = maxDepth,
        ["ancestor_count"] = ancestors,
        ["descendant_count"] = descendants,
        ["descendant_cost"] = cost,
        ["normalized_reach"] = Rational(reachN, reachD),
        ["dependency_betweenness"] = Rational(betweenN, betweenD)
    };

    private static byte[] AtlasBytes(byte[] topologyBytes) => Bytes(Atlas(topologyBytes));

    private static JsonObject Atlas(byte[] topologyBytes) => new()
    {
        ["schema_version"] = "topology-atlas.v1",
        ["truth_release_digest"] = ReleaseDigest,
        ["certified_topology_digest"] = Digest(topologyBytes),
        ["certified_algorithm_profile_digest"] = CertifiedProfileDigest,
        ["algorithm_profile_digest"] = AtlasProfileDigest,
        ["producer_commit"] = new string('5', 40),
        ["clusters"] = new JsonArray(
            Cluster(Component, null, 0, "weak-component",
                ["A.lean", "B.lean", "C.lean"], ["B.lean"], [], ["A.lean"], 0, 2, 2, 0),
            Cluster(BridgeBlock, Component, 1, "bridge-block",
                ["A.lean", "B.lean", "C.lean"], ["B.lean"], ["B.lean", "C.lean"], ["A.lean"], 0, 2, 2, 0),
            Cluster(CommunityOne, BridgeBlock, 2, "affinity-community",
                ["A.lean", "B.lean"], ["B.lean"], ["B.lean"], ["A.lean"], 0, 1, 1, 1),
            Cluster(CommunityTwo, BridgeBlock, 2, "affinity-community",
                ["C.lean"], ["C.lean"], ["C.lean"], ["C.lean"], 2, 2, 0, 1)),
        ["node_structure"] = new JsonArray(
            AtlasNode("A.lean", CommunityOne, "ordinary", 3, 1, 1, 0, 1, 0, 2, "foundation"),
            AtlasNode("B.lean", CommunityOne, "articulation-point", 2, 2, 3, 1, 2, 1, 1, "bridge"),
            AtlasNode("C.lean", CommunityTwo, "ordinary", 1, 1, 3, 1, 1, 2, 0, "frontier-adjacent")),
        ["edge_structure"] = new JsonArray(
            AtlasEdge("A.lean", "B.lean", 1, false, "intra-cluster", CommunityOne, CommunityOne),
            AtlasEdge("B.lean", "C.lean", 2, true, "inter-cluster", CommunityOne, CommunityTwo)),
        ["structural_affinities"] = new JsonArray(new JsonObject
        {
            ["source_node_id"] = "A.lean",
            ["neighbor_node_id"] = "C.lean",
            ["rank"] = 1,
            ["mutual_top_k"] = true,
            ["direct_dependency"] = false,
            ["shared_ancestor_jaccard"] = Rational(0, 1),
            ["shared_descendant_jaccard"] = Rational(0, 1),
            ["undirected_path_distance"] = 2,
            ["deepest_common_prerequisite_depth"] = null,
            ["combined_rank"] = Rational(1, 4)
        }),
        ["hierarchy"] = new JsonArray(
            Hierarchy(0, "weak-component", [Component]),
            Hierarchy(1, "bridge-block", [BridgeBlock]),
            Hierarchy(2, "affinity-community", [CommunityOne, CommunityTwo]))
    };

    private static JsonObject Cluster(
        string id,
        string? parent,
        int level,
        string name,
        string[] members,
        string[] representatives,
        string[] boundaries,
        string[] roots,
        int depthMin,
        int depthMax,
        int internalEdges,
        int externalEdges) => new()
    {
        ["cluster_id"] = id,
        ["parent_cluster_id"] = parent,
        ["level"] = level,
        ["level_name"] = name,
        ["member_node_ids"] = Strings(members),
        ["representative_node_ids"] = Strings(representatives),
        ["boundary_node_ids"] = Strings(boundaries),
        ["root_node_ids"] = Strings(roots),
        ["depth_min"] = depthMin,
        ["depth_max"] = depthMax,
        ["internal_edge_count"] = internalEdges,
        ["external_edge_count"] = externalEdges
    };

    private static JsonObject AtlasNode(
        string id,
        string leafCluster,
        string articulation,
        int coverageCount,
        int coverageN,
        int coverageD,
        int boundaryN,
        int boundaryD,
        int depth,
        int height,
        string role) => new()
    {
        ["node_id"] = id,
        ["component_id"] = Component,
        ["cluster_path"] = Strings([Component, BridgeBlock, leafCluster]),
        ["articulation_status"] = articulation,
        ["dominator_coverage_count"] = coverageCount,
        ["dominator_coverage"] = Rational(coverageN, coverageD),
        ["boundary_score"] = Rational(boundaryN, boundaryD),
        ["k_core_level"] = 1,
        ["depth"] = depth,
        ["height"] = height,
        ["structural_role"] = role
    };

    private static JsonObject AtlasEdge(
        string source,
        string target,
        int betweenness,
        bool bridge,
        string relation,
        string sourceCluster,
        string targetCluster) => new()
    {
        ["dependency_id"] = source,
        ["dependent_id"] = target,
        ["edge_betweenness"] = Rational(betweenness, 1),
        ["is_cut_bridge"] = bridge,
        ["cluster_relation"] = relation,
        ["source_cluster_id"] = sourceCluster,
        ["target_cluster_id"] = targetCluster,
        ["dependency_span"] = 1
    };

    private static JsonObject Hierarchy(int level, string name, string[] ids) => new()
    {
        ["level"] = level,
        ["name"] = name,
        ["cluster_ids"] = Strings(ids)
    };

    private static JsonObject Rational(int numerator, int denominator) => new()
    {
        ["numerator"] = numerator,
        ["denominator"] = denominator
    };

    private static JsonArray Strings(IEnumerable<string> values) =>
        new(values.Select(value => (JsonNode?)JsonValue.Create(value)).ToArray());

    private static byte[] Bytes(JsonNode value) =>
        JsonSerializer.SerializeToUtf8Bytes(value);

    private static string Digest(ReadOnlySpan<byte> bytes) =>
        "sha256:" + Convert.ToHexStringLower(SHA256.HashData(bytes));

    private const string ReleaseDigest =
        "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    private const string CertifiedProfileDigest =
        "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc";
    private const string AtlasProfileDigest =
        "sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd";
    private const string Component =
        "cluster:sha256:0000000000000000000000000000000000000000000000000000000000000000";
    private const string BridgeBlock =
        "cluster:sha256:1111111111111111111111111111111111111111111111111111111111111111";
    private const string CommunityOne =
        "cluster:sha256:2222222222222222222222222222222222222222222222222222222222222222";
    private const string CommunityTwo =
        "cluster:sha256:3333333333333333333333333333333333333333333333333333333333333333";
}
