using System.Text.Json;
using System.Text.Json.Nodes;

namespace Trureturing.Pages.Core;

public static class PagesTopologyAtlasProjection
{
    private static readonly HashSet<string> CertifiedLayers =
        new(StringComparer.Ordinal)
        {
            "truth-dependency",
            "module-import",
            "frozen-prerequisite"
        };

    public static PagesAtlasProjectionArtifacts Build(
        ReadOnlySpan<byte> graphBytes,
        ReadOnlySpan<byte> certifiedTopologyBytes,
        ReadOnlySpan<byte> topologyAtlasBytes)
    {
        if (topologyAtlasBytes.IsEmpty)
        {
            return PagesAtlasProjection.Build(
                graphBytes,
                certifiedTopologyBytes);
        }

        PagesAtlasProjectionArtifacts basic =
            PagesAtlasProjection.Build(
                graphBytes,
                certifiedTopologyBytes);
        using JsonDocument atlasDocument = PagesStrictJson.Parse(
            topologyAtlasBytes,
            "topology atlas");
        PagesTopologyAtlas atlas = PagesTopologyAtlasReader.Read(
            atlasDocument.RootElement);
        ValidateBinding(basic.Manifest, atlas);

        JsonObject graph = JsonNode.Parse(
            basic.GraphBytes)?.AsObject()
            ?? throw new InvalidDataException(
                "Pages atlas projection is null.");
        JsonArray nodes = PagesStrictJson.RequireArray(
            graph,
            "nodes",
            "$graph");
        JsonArray edges = PagesStrictJson.RequireArray(
            graph,
            "edges",
            "$graph");
        JsonObject counts = PagesStrictJson.RequireObject(
            graph,
            "counts",
            "$graph");
        JsonObject snapshot = PagesStrictJson.RequireObject(
            graph,
            "source_snapshot",
            "$graph");

        BuildNodeMaps(
            nodes,
            out SortedDictionary<string, JsonObject> nodeByPath,
            out SortedDictionary<string, string> localIdByPath,
            out Dictionary<string, JsonObject> nodeByLocalId);
        RequireExactNodeClosure(nodeByPath.Keys, atlas.Nodes);

        foreach (PagesTopologyAtlasNode structure in atlas.Nodes)
        {
            JsonObject node = nodeByPath[structure.NodeId];
            long certifiedDepth = RequiredLong(node, "true_depth");
            if (certifiedDepth != structure.Depth)
            {
                throw new InvalidDataException(
                    $"Topology atlas depth disagrees with certified topology for {structure.NodeId}.");
            }
            AttachNodeStructure(node, structure);
        }

        JsonArray projectedClusters = ProjectClusters(
            atlas.Clusters,
            localIdByPath,
            nodeByLocalId);
        JsonArray projectedHierarchy = ProjectHierarchy(atlas.Hierarchy);
        AttachEdgeStructure(
            edges,
            atlas.Edges,
            localIdByPath);
        int affinityEdges = AppendAffinityEdges(
            edges,
            atlas.Affinities,
            localIdByPath);

        string topologyAtlasDigest =
            PagesStrictJson.Sha256(topologyAtlasBytes);
        graph["topology_atlas"] = new JsonObject
        {
            ["schema_version"] = "topology-atlas.v1",
            ["digest"] = topologyAtlasDigest,
            ["algorithm_profile_digest"] = atlas.AlgorithmProfileDigest,
            ["producer_commit"] = atlas.ProducerCommit,
            ["authority"] = "deterministic-derived",
            ["relation_boundary"] =
                "clusters and affinities do not create certified proof dependencies"
        };
        graph["clusters"] = projectedClusters;
        graph["cluster_hierarchy"] = projectedHierarchy;

        JsonObject projection = PagesStrictJson.RequireObject(
            graph,
            "atlas_projection",
            "$graph");
        projection["topology_atlas_digest"] = topologyAtlasDigest;
        snapshot["topology_atlas_digest"] = topologyAtlasDigest;
        snapshot["topology_atlas_profile_digest"] =
            atlas.AlgorithmProfileDigest;
        snapshot["topology_atlas_producer_commit"] =
            atlas.ProducerCommit;
        counts["topology_clusters"] = atlas.Clusters.Count;
        counts["structural_affinity_edges"] = affinityEdges;
        counts["edges"] = edges.Count;

        byte[] projectedGraphBytes = PagesStrictJson.SerializeNode(graph);
        PagesAtlasManifestCounts projectedCounts =
            basic.Manifest.Counts with { Edges = edges.Count };
        PagesAtlasManifest manifest = basic.Manifest with
        {
            AtlasGraphDigest = PagesStrictJson.Sha256(projectedGraphBytes),
            TopologyAtlasDigest = topologyAtlasDigest,
            Counts = projectedCounts
        };
        byte[] manifestBytes = PagesStrictJson.SerializeValue(manifest);
        return new PagesAtlasProjectionArtifacts(
            projectedGraphBytes,
            manifestBytes,
            manifest);
    }

    private static void ValidateBinding(
        PagesAtlasManifest manifest,
        PagesTopologyAtlas atlas)
    {
        if (!StringComparer.Ordinal.Equals(
                manifest.TruthReleaseDigest,
                atlas.TruthReleaseDigest))
        {
            throw new InvalidDataException(
                "Topology atlas is bound to a different truth release.");
        }
        if (!StringComparer.Ordinal.Equals(
                manifest.CertifiedTopologyDigest,
                atlas.CertifiedTopologyDigest))
        {
            throw new InvalidDataException(
                "Topology atlas is bound to different certified topology bytes.");
        }
        if (!StringComparer.Ordinal.Equals(
                manifest.CertifiedTopologyProfileDigest,
                atlas.CertifiedAlgorithmProfileDigest))
        {
            throw new InvalidDataException(
                "Topology atlas is bound to a different certified topology profile.");
        }
    }

    private static void BuildNodeMaps(
        JsonArray nodes,
        out SortedDictionary<string, JsonObject> nodeByPath,
        out SortedDictionary<string, string> localIdByPath,
        out Dictionary<string, JsonObject> nodeByLocalId)
    {
        nodeByPath = new SortedDictionary<string, JsonObject>(
            StringComparer.Ordinal);
        localIdByPath = new SortedDictionary<string, string>(
            StringComparer.Ordinal);
        nodeByLocalId = new Dictionary<string, JsonObject>(
            StringComparer.Ordinal);
        foreach (JsonNode? value in nodes)
        {
            if (value is not JsonObject node)
            {
                throw new InvalidDataException(
                    "Pages atlas nodes must be objects.");
            }
            string id = PagesStrictJson.RequiredString(
                node,
                "id",
                "$graph.nodes[]");
            if (!nodeByLocalId.TryAdd(id, node))
            {
                throw new InvalidDataException(
                    $"Pages atlas contains duplicate node id {id}.");
            }
            string kind = PagesStrictJson.RequiredString(
                node,
                "kind",
                $"$graph.nodes[{id}]");
            if (!StringComparer.Ordinal.Equals(kind, "truth"))
            {
                continue;
            }
            string path = PagesStrictJson.RequiredString(
                node,
                "repo_path",
                $"$graph.nodes[{id}]");
            if (!nodeByPath.TryAdd(path, node) ||
                !localIdByPath.TryAdd(path, id))
            {
                throw new InvalidDataException(
                    $"Pages atlas contains duplicate truth path {path}.");
            }
        }
    }

    private static void RequireExactNodeClosure(
        IEnumerable<string> projectedPaths,
        IReadOnlyList<PagesTopologyAtlasNode> atlasNodes)
    {
        string[] projected = projectedPaths
            .Order(StringComparer.Ordinal)
            .ToArray();
        string[] published = atlasNodes
            .Select(node => node.NodeId)
            .Order(StringComparer.Ordinal)
            .ToArray();
        if (!projected.SequenceEqual(published))
        {
            throw new InvalidDataException(
                "Topology atlas node structure does not close exactly over the Pages truth nodes.");
        }
    }

    private static void AttachNodeStructure(
        JsonObject node,
        PagesTopologyAtlasNode structure)
    {
        node["component_id"] = structure.ComponentId;
        node["cluster_path"] = StringArray(structure.ClusterPath);
        node["atlas_cluster_id"] = structure.ClusterPath[2];
        node["articulation_status"] = structure.ArticulationStatus;
        node["dominator_coverage_count"] =
            structure.DominatorCoverageCount;
        node["dominator_coverage"] =
            structure.DominatorCoverage.ToString();
        node["boundary_score"] = structure.BoundaryScore.ToString();
        node["k_core_level"] = structure.KCoreLevel;
        node["topology_height"] = structure.Height;
        node["structural_role"] = structure.StructuralRole;
        node["atlas_structure_source"] = "topology-atlas.v1";
        node["structure_authority"] = "deterministic-derived";
    }

    private static JsonArray ProjectClusters(
        IReadOnlyList<PagesTopologyAtlasCluster> clusters,
        IReadOnlyDictionary<string, string> localIdByPath,
        IReadOnlyDictionary<string, JsonObject> nodeByLocalId)
    {
        var output = new JsonArray();
        foreach (PagesTopologyAtlasCluster cluster in clusters
            .OrderBy(item => item.Level)
            .ThenBy(item => item.ClusterId, StringComparer.Ordinal))
        {
            string[] memberIds = MapNodeIds(
                cluster.MemberNodeIds,
                localIdByPath);
            string[] representatives = MapNodeIds(
                cluster.RepresentativeNodeIds,
                localIdByPath);
            string label = ClusterLabel(
                cluster,
                memberIds,
                representatives,
                nodeByLocalId);
            output.Add(new JsonObject
            {
                ["cluster_id"] = cluster.ClusterId,
                ["parent_cluster_id"] = cluster.ParentClusterId,
                ["level"] = cluster.Level,
                ["level_name"] = cluster.LevelName,
                ["display_label"] = label,
                ["label_authority"] = "pages-derived",
                ["member_node_ids"] = StringArray(memberIds),
                ["representative_node_ids"] = StringArray(representatives),
                ["boundary_node_ids"] = StringArray(MapNodeIds(
                    cluster.BoundaryNodeIds,
                    localIdByPath)),
                ["root_node_ids"] = StringArray(MapNodeIds(
                    cluster.RootNodeIds,
                    localIdByPath)),
                ["depth_min"] = cluster.DepthMin,
                ["depth_max"] = cluster.DepthMax,
                ["internal_edge_count"] = cluster.InternalEdgeCount,
                ["external_edge_count"] = cluster.ExternalEdgeCount,
                ["authority"] = "topology-atlas-derived"
            });
        }
        return output;
    }

    private static JsonArray ProjectHierarchy(
        IReadOnlyList<PagesTopologyAtlasHierarchyLevel> hierarchy)
    {
        var output = new JsonArray();
        foreach (PagesTopologyAtlasHierarchyLevel level in hierarchy
            .OrderBy(item => item.Level))
        {
            output.Add(new JsonObject
            {
                ["level"] = level.Level,
                ["name"] = level.Name,
                ["cluster_ids"] = StringArray(level.ClusterIds)
            });
        }
        return output;
    }

    private static void AttachEdgeStructure(
        JsonArray graphEdges,
        IReadOnlyList<PagesTopologyAtlasEdge> atlasEdges,
        IReadOnlyDictionary<string, string> localIdByPath)
    {
        var certified = new Dictionary<(string Source, string Target), JsonObject>();
        foreach (JsonNode? value in graphEdges)
        {
            if (value is not JsonObject edge)
            {
                throw new InvalidDataException(
                    "Pages atlas edges must be objects.");
            }
            string layer = OptionalString(edge, "layer") ?? string.Empty;
            string status = OptionalString(edge, "status") ?? string.Empty;
            if (!CertifiedLayers.Contains(layer) &&
                !StringComparer.Ordinal.Equals(status, "certified"))
            {
                continue;
            }
            string? source = EndpointId(edge, "source");
            string? target = EndpointId(edge, "target");
            if (source is null || target is null ||
                !certified.TryAdd((source, target), edge))
            {
                throw new InvalidDataException(
                    "Pages atlas contains duplicate or malformed certified edges.");
            }
        }

        if (certified.Count != atlasEdges.Count)
        {
            throw new InvalidDataException(
                "Topology atlas edge structure does not close over certified Pages edges.");
        }
        foreach (PagesTopologyAtlasEdge structure in atlasEdges)
        {
            if (!localIdByPath.TryGetValue(
                    structure.DependencyId,
                    out string? source) ||
                !localIdByPath.TryGetValue(
                    structure.DependentId,
                    out string? target) ||
                !certified.TryGetValue((source, target), out JsonObject? edge))
            {
                throw new InvalidDataException(
                    $"Topology atlas edge {structure.DependencyId} -> {structure.DependentId} is absent from the Pages graph.");
            }
            edge["edge_betweenness"] =
                structure.EdgeBetweenness.ToString();
            edge["is_cut_bridge"] = structure.IsCutBridge;
            edge["cluster_relation"] = structure.ClusterRelation;
            edge["source_cluster_id"] = structure.SourceClusterId;
            edge["target_cluster_id"] = structure.TargetClusterId;
            edge["dependency_span"] = structure.DependencySpan;
            edge["edge_structure_source"] = "topology-atlas.v1";
        }
    }

    private static int AppendAffinityEdges(
        JsonArray graphEdges,
        IReadOnlyList<PagesTopologyAtlasAffinity> affinities,
        IReadOnlyDictionary<string, string> localIdByPath)
    {
        var selected = new SortedDictionary<(string Left, string Right), PagesTopologyAtlasAffinity>(
            Comparer<(string Left, string Right)>.Create((left, right) =>
            {
                int first = StringComparer.Ordinal.Compare(left.Left, right.Left);
                return first != 0
                    ? first
                    : StringComparer.Ordinal.Compare(left.Right, right.Right);
            }));
        foreach (PagesTopologyAtlasAffinity affinity in affinities)
        {
            if (!localIdByPath.TryGetValue(
                    affinity.SourceNodeId,
                    out string? source) ||
                !localIdByPath.TryGetValue(
                    affinity.NeighborNodeId,
                    out string? neighbor))
            {
                throw new InvalidDataException(
                    $"Topology affinity {affinity.SourceNodeId} -> {affinity.NeighborNodeId} cannot be projected.");
            }
            (string Left, string Right) key = StringComparer.Ordinal.Compare(
                source,
                neighbor) <= 0
                ? (source, neighbor)
                : (neighbor, source);
            if (!selected.TryGetValue(key, out PagesTopologyAtlasAffinity? current) ||
                Prefer(affinity, current))
            {
                selected[key] = affinity;
            }
        }

        foreach (((string left, string right), PagesTopologyAtlasAffinity affinity) in selected)
        {
            graphEdges.Add(new JsonObject
            {
                ["source"] = left,
                ["target"] = right,
                ["layer"] = "structural-affinity",
                ["status"] = "derived",
                ["authority"] = "deterministic-derived",
                ["mutual_top_k"] = affinity.MutualTopK,
                ["affinity_rank"] = affinity.Rank,
                ["direct_dependency"] = affinity.DirectDependency,
                ["shared_ancestor_jaccard"] =
                    affinity.SharedAncestorJaccard.ToString(),
                ["shared_descendant_jaccard"] =
                    affinity.SharedDescendantJaccard.ToString(),
                ["undirected_path_distance"] =
                    affinity.UndirectedPathDistance,
                ["deepest_common_prerequisite_depth"] =
                    affinity.DeepestCommonPrerequisiteDepth,
                ["combined_rank"] = affinity.CombinedRank.ToString(),
                ["relation_explanation"] =
                    "Derived structural affinity; no certified proof edge"
            });
        }
        return selected.Count;
    }

    private static bool Prefer(
        PagesTopologyAtlasAffinity candidate,
        PagesTopologyAtlasAffinity current)
    {
        if (candidate.MutualTopK != current.MutualTopK)
        {
            return candidate.MutualTopK;
        }
        if (candidate.Rank != current.Rank)
        {
            return candidate.Rank < current.Rank;
        }
        int source = StringComparer.Ordinal.Compare(
            candidate.SourceNodeId,
            current.SourceNodeId);
        return source < 0 || source == 0 &&
            StringComparer.Ordinal.Compare(
                candidate.NeighborNodeId,
                current.NeighborNodeId) < 0;
    }

    private static string ClusterLabel(
        PagesTopologyAtlasCluster cluster,
        IReadOnlyList<string> memberIds,
        IReadOnlyList<string> representatives,
        IReadOnlyDictionary<string, JsonObject> nodeByLocalId)
    {
        string[] domains = memberIds
            .Select(id => OptionalString(nodeByLocalId[id], "domain"))
            .Where(value => !string.IsNullOrWhiteSpace(value))
            .Cast<string>()
            .Distinct(StringComparer.Ordinal)
            .Order(StringComparer.Ordinal)
            .ToArray();
        if (domains.Length == 1)
        {
            return cluster.LevelName switch
            {
                "weak-component" => domains[0] + " structure",
                "bridge-block" => domains[0] + " block",
                _ => domains[0] + " community"
            };
        }

        string[] titles = representatives
            .Select(id => HumanTitle(nodeByLocalId[id]))
            .Where(value => !string.IsNullOrWhiteSpace(value))
            .Distinct(StringComparer.Ordinal)
            .Take(2)
            .ToArray();
        if (titles.Length > 0)
        {
            return string.Join(" · ", titles) + " structure";
        }
        return cluster.LevelName switch
        {
            "weak-component" => "Connected theory structure",
            "bridge-block" => "Dependency bridge block",
            _ => "Structural affinity community"
        };
    }

    private static string HumanTitle(JsonObject node)
    {
        string? authored = OptionalString(node, "human_title");
        if (!string.IsNullOrWhiteSpace(authored) && authored != "None")
        {
            return authored;
        }
        string raw = OptionalString(node, "repo_path")
            ?? OptionalString(node, "title")
            ?? PagesStrictJson.RequiredString(node, "id", "$graph.nodes[]");
        string leaf = raw.Replace(".lean", string.Empty, StringComparison.Ordinal)
            .Split('/').Last();
        var output = new System.Text.StringBuilder();
        for (int index = 0; index < leaf.Length; index++)
        {
            char character = leaf[index];
            if (index > 0 && char.IsUpper(character) &&
                (char.IsLower(leaf[index - 1]) ||
                 index + 1 < leaf.Length && char.IsLower(leaf[index + 1])))
            {
                output.Append(' ');
            }
            output.Append(character);
        }
        return output.ToString();
    }

    private static string[] MapNodeIds(
        IReadOnlyList<string> paths,
        IReadOnlyDictionary<string, string> localIdByPath) =>
        paths.Select(path => localIdByPath.TryGetValue(path, out string? id)
                ? id
                : throw new InvalidDataException(
                    $"Topology atlas references unknown truth path {path}."))
            .Order(StringComparer.Ordinal)
            .ToArray();

    private static JsonArray StringArray(IEnumerable<string> values)
    {
        var output = new JsonArray();
        foreach (string value in values)
        {
            output.Add(value);
        }
        return output;
    }

    private static long RequiredLong(JsonObject node, string name)
    {
        if (node[name] is not JsonValue value ||
            !value.TryGetValue(out long result) ||
            result < 0)
        {
            throw new InvalidDataException(
                $"Pages atlas node field {name} must be a non-negative integer.");
        }
        return result;
    }

    private static string? EndpointId(JsonObject edge, string name)
    {
        if (edge[name] is JsonValue value &&
            value.TryGetValue(out string? result))
        {
            return result;
        }
        if (edge[name] is JsonObject endpoint &&
            endpoint["id"] is JsonValue id &&
            id.TryGetValue(out string? nested))
        {
            return nested;
        }
        return null;
    }

    private static string? OptionalString(JsonObject parent, string name)
    {
        if (parent[name] is JsonValue value &&
            value.TryGetValue(out string? result) &&
            !string.IsNullOrWhiteSpace(result))
        {
            return result;
        }
        return null;
    }
}
