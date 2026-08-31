using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Trureturing.Pages.Core;
using Xunit;

namespace Trureturing.Pages.Tests;

public sealed class TopologyAtlasProjectionTests
{
    [Fact]
    public void ProjectsMultiscaleStructureWithoutPromotingAffinityToProof()
    {
        byte[] graphBytes = GraphBytes();
        byte[] topologyBytes = TopologyBytes();
        byte[] atlasBytes = AtlasBytes(topologyBytes);

        PagesAtlasProjectionArtifacts artifacts =
            PagesTopologyAtlasProjection.Build(
                graphBytes,
                topologyBytes,
                atlasBytes);

        Assert.Equal(
            Digest(atlasBytes),
            artifacts.Manifest.TopologyAtlasDigest);
        Assert.Equal(4, artifacts.Manifest.Counts.Edges);

        using JsonDocument graph = JsonDocument.Parse(artifacts.GraphBytes);
        JsonElement root = graph.RootElement;
        Assert.Equal(
            "topology-atlas.v1",
            root.GetProperty("topology_atlas")
                .GetProperty("schema_version")
                .GetString());
        Assert.Equal(4, root.GetProperty("clusters").GetArrayLength());
        Assert.Equal(3, root.GetProperty("cluster_hierarchy").GetArrayLength());

        JsonElement bridge = Assert.Single(
            root.GetProperty("nodes").EnumerateArray(),
            node => node.GetProperty("id").GetString() == "B");
        Assert.Equal(
            "bridge",
            bridge.GetProperty("structural_role").GetString());
        Assert.Equal(
            CommunityOne,
            bridge.GetProperty("atlas_cluster_id").GetString());
        Assert.Equal(
            "topology-atlas.v1",
            bridge.GetProperty("atlas_structure_source").GetString());

        JsonElement crossCluster = Assert.Single(
            root.GetProperty("edges").EnumerateArray(),
            edge => edge.GetProperty("source").GetString() == "B" &&
                edge.GetProperty("target").GetString() == "C");
        Assert.True(crossCluster.GetProperty("is_cut_bridge").GetBoolean());
        Assert.Equal(
            "inter-cluster",
            crossCluster.GetProperty("cluster_relation").GetString());

        JsonElement affinity = Assert.Single(
            root.GetProperty("edges").EnumerateArray(),
            edge => edge.GetProperty("layer").GetString() ==
                "structural-affinity");
        Assert.Equal("derived", affinity.GetProperty("status").GetString());
        Assert.Equal(
            "deterministic-derived",
            affinity.GetProperty("authority").GetString());
        Assert.False(affinity.GetProperty("direct_dependency").GetBoolean());
        Assert.DoesNotContain(
            affinity.GetProperty("layer").GetString(),
            new[] { "truth-dependency", "module-import", "frozen-prerequisite" });
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

        PagesConformationArtifacts first =
            PagesTopologyAtlasConformation.Build(
                projection.GraphBytes,
                projection.ManifestBytes);
        PagesConformationArtifacts second =
            PagesTopologyAtlasConformation.Build(
                projection.GraphBytes,
                projection.ManifestBytes);

        Assert.Equal(first.ConformationBytes, second.ConformationBytes);
        Assert.Equal(first.BoundManifestBytes, second.BoundManifestBytes);
        Assert.Equal(
            "topology-atlas.v1",
            first.Conformation.StructureSource);
        Assert.Equal(
            PagesTopologyAtlasConformationSchemas.LayoutProfile,
            first.Conformation.LayoutProfile.Name);
        Assert.Equal(
            Digest(projection.ManifestBytes).StartsWith("sha256:", StringComparison.Ordinal),
            true);

        Dictionary<string, PagesConformationNode> nodes = first.Conformation.Nodes
            .ToDictionary(node => node.NodeId, StringComparer.Ordinal);
        Assert.Equal(CommunityOne, nodes["A"].RegionId);
        Assert.Equal(CommunityOne, nodes["B"].RegionId);
        Assert.Equal(CommunityTwo, nodes["C"].RegionId);
        Assert.Equal(0, nodes["A"].Aligned.Y);
        Assert.Equal(
            PagesTopologyAtlasConformationSchemas.DepthStep,
            nodes["B"].Aligned.Y);
        Assert.Equal(
            2 * PagesTopologyAtlasConformationSchemas.DepthStep,
            nodes["C"].Aligned.Y);
        Assert.Contains(
            first.Conformation.Regions,
            region => region.RegionId == CommunityOne &&
                region.Authority == "topology-atlas-derived");
        Assert.Contains(
            first.Conformation.Regions,
            region => region.Authority == "pages-derived-fallback");

        using JsonDocument bound = JsonDocument.Parse(
            first.BoundManifestBytes);
        Assert.Equal(
            first.ConformationDigest,
            bound.RootElement.GetProperty("conformation_digest").GetString());
    }

    [Fact]
    public void RejectsMixedCertifiedBytesAndIncompleteAtlasClosure()
    {
        byte[] graphBytes = GraphBytes();
        byte[] topologyBytes = TopologyBytes();
        string valid = Encoding.UTF8.GetString(AtlasBytes(topologyBytes));

        byte[] mixed = Encoding.UTF8.GetBytes(valid.Replace(
            Digest(topologyBytes),
            "sha256:" + new string('9', 64),
            StringComparison.Ordinal));
        InvalidDataException binding = Assert.Throws<InvalidDataException>(() =>
            PagesTopologyAtlasProjection.Build(
                graphBytes,
                topologyBytes,
                mixed));
        Assert.Contains(
            "different certified topology bytes",
            binding.Message,
            StringComparison.OrdinalIgnoreCase);

        byte[] incomplete = Encoding.UTF8.GetBytes(valid.Replace(
            "\"node_id\":\"C.lean\"",
            "\"node_id\":\"Missing.lean\"",
            StringComparison.Ordinal));
        InvalidDataException closure = Assert.Throws<InvalidDataException>(() =>
            PagesTopologyAtlasProjection.Build(
                graphBytes,
                topologyBytes,
                incomplete));
        Assert.Contains(
            "unknown node",
            closure.Message,
            StringComparison.OrdinalIgnoreCase);
    }

    private const string ReleaseDigest =
        "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" +
        "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    private const string CertifiedProfileDigest =
        "sha256:cccccccccccccccccccccccccccccccc" +
        "cccccccccccccccccccccccccccccccc";
    private const string AtlasProfileDigest =
        "sha256:dddddddddddddddddddddddddddddddd" +
        "dddddddddddddddddddddddddddddddd";
    private const string Component =
        "cluster:sha256:00000000000000000000000000000000" +
        "00000000000000000000000000000000";
    private const string BridgeBlock =
        "cluster:sha256:11111111111111111111111111111111" +
        "11111111111111111111111111111111";
    private const string CommunityOne =
        "cluster:sha256:22222222222222222222222222222222" +
        "22222222222222222222222222222222";
    private const string CommunityTwo =
        "cluster:sha256:33333333333333333333333333333333" +
        "33333333333333333333333333333333";

    private static byte[] GraphBytes() => Encoding.UTF8.GetBytes(
        $$"""
        {
          "schema_version":"pages-truth-release-dag.v1",
          "synthetic":true,
          "source_snapshot":{
            "source_repo":"the-omega-institute/trureturing",
            "source_commit":"1111111111111111111111111111111111111111",
            "source_tree":"2222222222222222222222222222222222222222",
            "truth_release_digest":"{{ReleaseDigest}}",
            "truth_graph_sha256":"sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
            "topology_algorithm":"Trureturing.Topology/0.1.0-alpha.1"
          },
          "counts":{
            "nodes":4,
            "truth_nodes":3,
            "blueprint_nodes":1,
            "dag_closed":2,
            "dag_open":1,
            "dag_tail":0,
            "dag_semantic":0,
            "edges":3,
            "truth_edges":2,
            "blueprint_links":1
          },
          "nodes":[
            {
              "id":"A","gid":"A","title":"A","status":"Closed","state":"closed",
              "kind":"truth","summary":"A","depth":0,"repo_path":"A.lean",
              "layer":"D5/S0","domain":"Alpha","human_title":"Alpha"
            },
            {
              "id":"B","gid":"B","title":"B","status":"Closed","state":"closed",
              "kind":"truth","summary":"B","depth":1,"repo_path":"B.lean",
              "layer":"D5/S1","domain":"Alpha","human_title":"Beta"
            },
            {
              "id":"C","gid":"C","title":"C","status":"Open","state":"open",
              "kind":"truth","summary":"C","depth":2,"repo_path":"C.lean",
              "layer":"D5/X_Frontier","domain":"Gamma","human_title":"Gamma"
            },
            {
              "id":"blueprint:A","gid":null,"title":"Alpha document","status":"Semantic",
              "state":"semantic","kind":"blueprint","summary":"Blueprint","depth":0,
              "repo_path":"Blueprint/A.md","layer":"Blueprint","domain":"Document"
            }
          ],
          "edges":[
            {"source":"A","target":"B","layer":"truth-dependency"},
            {"source":"B","target":"C","layer":"truth-dependency"},
            {"source":"blueprint:A","target":"A","layer":"blueprint-truth-anchor"}
          ],
          "human_labels":{"blueprint_ref":"fixture"}
        }
        """);

    private static byte[] TopologyBytes() => Encoding.UTF8.GetBytes(
        $$"""
        {
          "schema_version":"certified-topology.v1",
          "truth_release_digest":"{{ReleaseDigest}}",
          "algorithm_profile_digest":"{{CertifiedProfileDigest}}",
          "producer_commit":"4444444444444444444444444444444444444444",
          "nodes":[
            {
              "node_id":"A.lean","in_degree":0,"out_degree":1,"min_depth":0,"max_depth":0,
              "ancestor_count":0,"descendant_count":2,"descendant_cost":8,
              "normalized_reach":{"numerator":1,"denominator":1},
              "dependency_betweenness":{"numerator":0,"denominator":1}
            },
            {
              "node_id":"B.lean","in_degree":1,"out_degree":1,"min_depth":1,"max_depth":1,
              "ancestor_count":1,"descendant_count":1,"descendant_cost":4,
              "normalized_reach":{"numerator":1,"denominator":2},
              "dependency_betweenness":{"numerator":1,"denominator":1}
            },
            {
              "node_id":"C.lean","in_degree":1,"out_degree":0,"min_depth":2,"max_depth":2,
              "ancestor_count":2,"descendant_count":0,"descendant_cost":1,
              "normalized_reach":{"numerator":0,"denominator":1},
              "dependency_betweenness":{"numerator":0,"denominator":1}
            }
          ],
          "cycle_certificate":{"status":"acyclic","cycles":[]},
          "dangling_reference_certificate":{"status":"complete","dangling_references":[]}
        }
        """);

    private static byte[] AtlasBytes(byte[] topologyBytes) =>
        Encoding.UTF8.GetBytes(
            $$"""
            {
              "schema_version":"topology-atlas.v1",
              "truth_release_digest":"{{ReleaseDigest}}",
              "certified_topology_digest":"{{Digest(topologyBytes)}}",
              "certified_algorithm_profile_digest":"{{CertifiedProfileDigest}}",
              "algorithm_profile_digest":"{{AtlasProfileDigest}}",
              "producer_commit":"5555555555555555555555555555555555555555",
              "clusters":[
                {
                  "cluster_id":"{{Component}}","parent_cluster_id":null,"level":0,
                  "level_name":"weak-component","member_node_ids":["A.lean","B.lean","C.lean"],
                  "representative_node_ids":["B.lean"],"boundary_node_ids":[],
                  "root_node_ids":["A.lean"],"depth_min":0,"depth_max":2,
                  "internal_edge_count":2,"external_edge_count":0
                },
                {
                  "cluster_id":"{{BridgeBlock}}","parent_cluster_id":"{{Component}}","level":1,
                  "level_name":"bridge-block","member_node_ids":["A.lean","B.lean","C.lean"],
                  "representative_node_ids":["B.lean"],"boundary_node_ids":["B.lean","C.lean"],
                  "root_node_ids":["A.lean"],"depth_min":0,"depth_max":2,
                  "internal_edge_count":2,"external_edge_count":0
                },
                {
                  "cluster_id":"{{CommunityOne}}","parent_cluster_id":"{{BridgeBlock}}","level":2,
                  "level_name":"affinity-community","member_node_ids":["A.lean","B.lean"],
                  "representative_node_ids":["B.lean"],"boundary_node_ids":["B.lean"],
                  "root_node_ids":["A.lean"],"depth_min":0,"depth_max":1,
                  "internal_edge_count":1,"external_edge_count":1
                },
                {
                  "cluster_id":"{{CommunityTwo}}","parent_cluster_id":"{{BridgeBlock}}","level":2,
                  "level_name":"affinity-community","member_node_ids":["C.lean"],
                  "representative_node_ids":["C.lean"],"boundary_node_ids":["C.lean"],
                  "root_node_ids":["C.lean"],"depth_min":2,"depth_max":2,
                  "internal_edge_count":0,"external_edge_count":1
                }
              ],
              "node_structure":[
                {
                  "node_id":"A.lean","component_id":"{{Component}}",
                  "cluster_path":["{{Component}}","{{BridgeBlock}}","{{CommunityOne}}"],
                  "articulation_status":"ordinary","dominator_coverage_count":3,
                  "dominator_coverage":{"numerator":1,"denominator":1},
                  "boundary_score":{"numerator":0,"denominator":1},"k_core_level":1,
                  "depth":0,"height":2,"structural_role":"foundation"
                },
                {
                  "node_id":"B.lean","component_id":"{{Component}}",
                  "cluster_path":["{{Component}}","{{BridgeBlock}}","{{CommunityOne}}"],
                  "articulation_status":"articulation-point","dominator_coverage_count":2,
                  "dominator_coverage":{"numerator":2,"denominator":3},
                  "boundary_score":{"numerator":1,"denominator":2},"k_core_level":1,
                  "depth":1,"height":1,"structural_role":"bridge"
                },
                {
                  "node_id":"C.lean","component_id":"{{Component}}",
                  "cluster_path":["{{Component}}","{{BridgeBlock}}","{{CommunityTwo}}"],
                  "articulation_status":"ordinary","dominator_coverage_count":1,
                  "dominator_coverage":{"numerator":1,"denominator":3},
                  "boundary_score":{"numerator":1,"denominator":1},"k_core_level":1,
                  "depth":2,"height":0,"structural_role":"frontier-adjacent"
                }
              ],
              "edge_structure":[
                {
                  "dependency_id":"A.lean","dependent_id":"B.lean",
                  "edge_betweenness":{"numerator":1,"denominator":1},"is_cut_bridge":false,
                  "cluster_relation":"intra-cluster","source_cluster_id":"{{CommunityOne}}",
                  "target_cluster_id":"{{CommunityOne}}","dependency_span":1
                },
                {
                  "dependency_id":"B.lean","dependent_id":"C.lean",
                  "edge_betweenness":{"numerator":2,"denominator":1},"is_cut_bridge":true,
                  "cluster_relation":"inter-cluster","source_cluster_id":"{{CommunityOne}}",
                  "target_cluster_id":"{{CommunityTwo}}","dependency_span":1
                }
              ],
              "structural_affinities":[
                {
                  "source_node_id":"A.lean","neighbor_node_id":"C.lean","rank":1,
                  "mutual_top_k":true,"direct_dependency":false,
                  "shared_ancestor_jaccard":{"numerator":0,"denominator":1},
                  "shared_descendant_jaccard":{"numerator":0,"denominator":1},
                  "undirected_path_distance":2,"deepest_common_prerequisite_depth":null,
                  "combined_rank":{"numerator":1,"denominator":4}
                }
              ],
              "hierarchy":[
                {"level":0,"name":"weak-component","cluster_ids":["{{Component}}"]},
                {"level":1,"name":"bridge-block","cluster_ids":["{{BridgeBlock}}"]},
                {"level":2,"name":"affinity-community","cluster_ids":["{{CommunityOne}}","{{CommunityTwo}}"]}
              ]
            }
            """);

    private static string Digest(ReadOnlySpan<byte> bytes) =>
        "sha256:" + Convert.ToHexStringLower(SHA256.HashData(bytes));
}
