using System.Text.Json;

namespace Trureturing.Pages.Core;

internal sealed record PagesTopologyAtlasCluster(
    string ClusterId,
    string? ParentClusterId,
    int Level,
    string LevelName,
    IReadOnlyList<string> MemberNodeIds,
    IReadOnlyList<string> RepresentativeNodeIds,
    IReadOnlyList<string> BoundaryNodeIds,
    IReadOnlyList<string> RootNodeIds,
    long DepthMin,
    long DepthMax,
    long InternalEdgeCount,
    long ExternalEdgeCount);

internal sealed record PagesTopologyAtlasNode(
    string NodeId,
    string ComponentId,
    IReadOnlyList<string> ClusterPath,
    string ArticulationStatus,
    long DominatorCoverageCount,
    PagesAtlasRational DominatorCoverage,
    PagesAtlasRational BoundaryScore,
    long KCoreLevel,
    long Depth,
    long Height,
    string StructuralRole);

internal sealed record PagesTopologyAtlasEdge(
    string DependencyId,
    string DependentId,
    PagesAtlasRational EdgeBetweenness,
    bool IsCutBridge,
    string ClusterRelation,
    string SourceClusterId,
    string TargetClusterId,
    long DependencySpan);

internal sealed record PagesTopologyAtlasAffinity(
    string SourceNodeId,
    string NeighborNodeId,
    long Rank,
    bool MutualTopK,
    bool DirectDependency,
    PagesAtlasRational SharedAncestorJaccard,
    PagesAtlasRational SharedDescendantJaccard,
    long UndirectedPathDistance,
    long? DeepestCommonPrerequisiteDepth,
    PagesAtlasRational CombinedRank);

internal sealed record PagesTopologyAtlasHierarchyLevel(
    int Level,
    string Name,
    IReadOnlyList<string> ClusterIds);

internal sealed record PagesTopologyAtlas(
    string TruthReleaseDigest,
    string CertifiedTopologyDigest,
    string CertifiedAlgorithmProfileDigest,
    string AlgorithmProfileDigest,
    string ProducerCommit,
    IReadOnlyList<PagesTopologyAtlasCluster> Clusters,
    IReadOnlyList<PagesTopologyAtlasNode> Nodes,
    IReadOnlyList<PagesTopologyAtlasEdge> Edges,
    IReadOnlyList<PagesTopologyAtlasAffinity> Affinities,
    IReadOnlyList<PagesTopologyAtlasHierarchyLevel> Hierarchy);

internal static class PagesTopologyAtlasReader
{
    private static readonly string[] LevelNames =
    [
        "weak-component",
        "bridge-block",
        "affinity-community"
    ];

    private static readonly HashSet<string> StructuralRoles =
        new(StringComparer.Ordinal)
        {
            "foundation",
            "hub",
            "bridge",
            "interface",
            "specialized-leaf",
            "frontier-adjacent",
            "internal"
        };

    public static PagesTopologyAtlas Read(JsonElement root)
    {
        PagesStrictJson.RequireExactProperties(
            root,
            [
                "schema_version",
                "truth_release_digest",
                "certified_topology_digest",
                "certified_algorithm_profile_digest",
                "algorithm_profile_digest",
                "producer_commit",
                "clusters",
                "node_structure",
                "edge_structure",
                "structural_affinities",
                "hierarchy"
            ],
            "$atlas");

        string schema = PagesStrictJson.RequiredString(
            root,
            "schema_version",
            "$atlas");
        if (!StringComparer.Ordinal.Equals(schema, "topology-atlas.v1"))
        {
            throw new InvalidDataException(
                "Topology atlas schema must be topology-atlas.v1.");
        }

        string truthReleaseDigest = RequiredDigest(
            root,
            "truth_release_digest");
        string certifiedTopologyDigest = RequiredDigest(
            root,
            "certified_topology_digest");
        string certifiedProfileDigest = RequiredDigest(
            root,
            "certified_algorithm_profile_digest");
        string atlasProfileDigest = RequiredDigest(
            root,
            "algorithm_profile_digest");
        string producerCommit = PagesStrictJson.RequiredString(
            root,
            "producer_commit",
            "$atlas");
        PagesStrictJson.RequireGitCommit(
            producerCommit,
            "$atlas.producer_commit");

        PagesTopologyAtlasCluster[] clusters = ReadClusters(
            PagesStrictJson.RequiredProperty(
                root,
                "clusters",
                JsonValueKind.Array,
                "$atlas"));
        PagesTopologyAtlasNode[] nodes = ReadNodes(
            PagesStrictJson.RequiredProperty(
                root,
                "node_structure",
                JsonValueKind.Array,
                "$atlas"));
        PagesTopologyAtlasEdge[] edges = ReadEdges(
            PagesStrictJson.RequiredProperty(
                root,
                "edge_structure",
                JsonValueKind.Array,
                "$atlas"));
        PagesTopologyAtlasAffinity[] affinities = ReadAffinities(
            PagesStrictJson.RequiredProperty(
                root,
                "structural_affinities",
                JsonValueKind.Array,
                "$atlas"));
        PagesTopologyAtlasHierarchyLevel[] hierarchy = ReadHierarchy(
            PagesStrictJson.RequiredProperty(
                root,
                "hierarchy",
                JsonValueKind.Array,
                "$atlas"));

        ValidateStructure(clusters, nodes, edges, affinities, hierarchy);
        return new PagesTopologyAtlas(
            truthReleaseDigest,
            certifiedTopologyDigest,
            certifiedProfileDigest,
            atlasProfileDigest,
            producerCommit,
            clusters,
            nodes,
            edges,
            affinities,
            hierarchy);
    }

    private static PagesTopologyAtlasCluster[] ReadClusters(
        JsonElement values)
    {
        var result = new List<PagesTopologyAtlasCluster>();
        var ids = new HashSet<string>(StringComparer.Ordinal);
        foreach (JsonElement value in values.EnumerateArray())
        {
            PagesStrictJson.RequireExactProperties(
                value,
                [
                    "cluster_id",
                    "parent_cluster_id",
                    "level",
                    "level_name",
                    "member_node_ids",
                    "representative_node_ids",
                    "boundary_node_ids",
                    "root_node_ids",
                    "depth_min",
                    "depth_max",
                    "internal_edge_count",
                    "external_edge_count"
                ],
                "$atlas.clusters[]");
            string clusterId = RequiredClusterId(
                value,
                "cluster_id",
                "$atlas.clusters[]");
            if (!ids.Add(clusterId))
            {
                throw new InvalidDataException(
                    $"Topology atlas contains duplicate cluster {clusterId}.");
            }
            string? parent = NullableClusterId(
                value,
                "parent_cluster_id",
                $"$atlas.clusters[{clusterId}]");
            int level = RequiredLevel(
                value,
                "level",
                $"$atlas.clusters[{clusterId}]");
            string levelName = PagesStrictJson.RequiredString(
                value,
                "level_name",
                $"$atlas.clusters[{clusterId}]");
            if (!StringComparer.Ordinal.Equals(levelName, LevelNames[level]))
            {
                throw new InvalidDataException(
                    $"Cluster {clusterId} level and level_name disagree.");
            }
            string path = $"$atlas.clusters[{clusterId}]";
            string[] members = RequiredStringArray(
                value,
                "member_node_ids",
                path,
                minimum: 1);
            string[] representatives = RequiredStringArray(
                value,
                "representative_node_ids",
                path,
                minimum: 1,
                maximum: 3);
            string[] boundaries = RequiredStringArray(
                value,
                "boundary_node_ids",
                path);
            string[] roots = RequiredStringArray(
                value,
                "root_node_ids",
                path,
                minimum: 1);
            RequireSubset(representatives, members, path, "representative_node_ids");
            RequireSubset(boundaries, members, path, "boundary_node_ids");
            RequireSubset(roots, members, path, "root_node_ids");
            long depthMin = PagesStrictJson.RequiredNonNegativeInt64(
                value,
                "depth_min",
                path);
            long depthMax = PagesStrictJson.RequiredNonNegativeInt64(
                value,
                "depth_max",
                path);
            if (depthMin > depthMax)
            {
                throw new InvalidDataException(
                    $"Cluster {clusterId} depth range is inverted.");
            }
            result.Add(new PagesTopologyAtlasCluster(
                clusterId,
                parent,
                level,
                levelName,
                members,
                representatives,
                boundaries,
                roots,
                depthMin,
                depthMax,
                PagesStrictJson.RequiredNonNegativeInt64(
                    value,
                    "internal_edge_count",
                    path),
                PagesStrictJson.RequiredNonNegativeInt64(
                    value,
                    "external_edge_count",
                    path)));
        }
        return result.OrderBy(
            cluster => cluster.ClusterId,
            StringComparer.Ordinal).ToArray();
    }

    private static PagesTopologyAtlasNode[] ReadNodes(JsonElement values)
    {
        var result = new List<PagesTopologyAtlasNode>();
        var ids = new HashSet<string>(StringComparer.Ordinal);
        foreach (JsonElement value in values.EnumerateArray())
        {
            PagesStrictJson.RequireExactProperties(
                value,
                [
                    "node_id",
                    "component_id",
                    "cluster_path",
                    "articulation_status",
                    "dominator_coverage_count",
                    "dominator_coverage",
                    "boundary_score",
                    "k_core_level",
                    "depth",
                    "height",
                    "structural_role"
                ],
                "$atlas.node_structure[]");
            string nodeId = PagesStrictJson.RequiredString(
                value,
                "node_id",
                "$atlas.node_structure[]");
            if (!ids.Add(nodeId))
            {
                throw new InvalidDataException(
                    $"Topology atlas contains duplicate node structure {nodeId}.");
            }
            string path = $"$atlas.node_structure[{nodeId}]";
            string componentId = RequiredClusterId(
                value,
                "component_id",
                path);
            string[] clusterPath = RequiredStringArray(
                value,
                "cluster_path",
                path,
                minimum: 3,
                maximum: 3,
                clusterIds: true);
            string articulation = PagesStrictJson.RequiredString(
                value,
                "articulation_status",
                path);
            if (articulation is not "ordinary" and not "articulation-point")
            {
                throw new InvalidDataException(
                    $"Node {nodeId} has an unsupported articulation status.");
            }
            string role = PagesStrictJson.RequiredString(
                value,
                "structural_role",
                path);
            if (!StructuralRoles.Contains(role))
            {
                throw new InvalidDataException(
                    $"Node {nodeId} has an unsupported structural role.");
            }
            long coverageCount = PagesStrictJson.RequiredNonNegativeInt64(
                value,
                "dominator_coverage_count",
                path);
            if (coverageCount < 1)
            {
                throw new InvalidDataException(
                    $"Node {nodeId} dominator coverage count must be positive.");
            }
            result.Add(new PagesTopologyAtlasNode(
                nodeId,
                componentId,
                clusterPath,
                articulation,
                coverageCount,
                RequiredRational(value, "dominator_coverage", path),
                RequiredRational(value, "boundary_score", path),
                PagesStrictJson.RequiredNonNegativeInt64(
                    value,
                    "k_core_level",
                    path),
                PagesStrictJson.RequiredNonNegativeInt64(
                    value,
                    "depth",
                    path),
                PagesStrictJson.RequiredNonNegativeInt64(
                    value,
                    "height",
                    path),
                role));
        }
        return result.OrderBy(node => node.NodeId, StringComparer.Ordinal).ToArray();
    }

    private static PagesTopologyAtlasEdge[] ReadEdges(JsonElement values)
    {
        var result = new List<PagesTopologyAtlasEdge>();
        var ids = new HashSet<string>(StringComparer.Ordinal);
        foreach (JsonElement value in values.EnumerateArray())
        {
            PagesStrictJson.RequireExactProperties(
                value,
                [
                    "dependency_id",
                    "dependent_id",
                    "edge_betweenness",
                    "is_cut_bridge",
                    "cluster_relation",
                    "source_cluster_id",
                    "target_cluster_id",
                    "dependency_span"
                ],
                "$atlas.edge_structure[]");
            string dependency = PagesStrictJson.RequiredString(
                value,
                "dependency_id",
                "$atlas.edge_structure[]");
            string dependent = PagesStrictJson.RequiredString(
                value,
                "dependent_id",
                "$atlas.edge_structure[]");
            string edgeId = dependency + "\n" + dependent;
            if (!ids.Add(edgeId))
            {
                throw new InvalidDataException(
                    $"Topology atlas contains duplicate edge structure {dependency} -> {dependent}.");
            }
            string path = $"$atlas.edge_structure[{dependency}->{dependent}]";
            string relation = PagesStrictJson.RequiredString(
                value,
                "cluster_relation",
                path);
            if (relation is not "intra-cluster" and not "inter-cluster")
            {
                throw new InvalidDataException(
                    $"Edge {dependency} -> {dependent} has an unsupported cluster relation.");
            }
            long span = PagesStrictJson.RequiredNonNegativeInt64(
                value,
                "dependency_span",
                path);
            if (span < 1)
            {
                throw new InvalidDataException(
                    $"Edge {dependency} -> {dependent} dependency span must be positive.");
            }
            result.Add(new PagesTopologyAtlasEdge(
                dependency,
                dependent,
                RequiredRational(value, "edge_betweenness", path),
                RequiredBoolean(value, "is_cut_bridge", path),
                relation,
                RequiredClusterId(value, "source_cluster_id", path),
                RequiredClusterId(value, "target_cluster_id", path),
                span));
        }
        return result
            .OrderBy(edge => edge.DependencyId, StringComparer.Ordinal)
            .ThenBy(edge => edge.DependentId, StringComparer.Ordinal)
            .ToArray();
    }

    private static PagesTopologyAtlasAffinity[] ReadAffinities(
        JsonElement values)
    {
        var result = new List<PagesTopologyAtlasAffinity>();
        var ids = new HashSet<string>(StringComparer.Ordinal);
        foreach (JsonElement value in values.EnumerateArray())
        {
            PagesStrictJson.RequireExactProperties(
                value,
                [
                    "source_node_id",
                    "neighbor_node_id",
                    "rank",
                    "mutual_top_k",
                    "direct_dependency",
                    "shared_ancestor_jaccard",
                    "shared_descendant_jaccard",
                    "undirected_path_distance",
                    "deepest_common_prerequisite_depth",
                    "combined_rank"
                ],
                "$atlas.structural_affinities[]");
            string source = PagesStrictJson.RequiredString(
                value,
                "source_node_id",
                "$atlas.structural_affinities[]");
            string neighbor = PagesStrictJson.RequiredString(
                value,
                "neighbor_node_id",
                "$atlas.structural_affinities[]");
            if (StringComparer.Ordinal.Equals(source, neighbor))
            {
                throw new InvalidDataException(
                    $"Topology affinity {source} cannot reference itself.");
            }
            if (!ids.Add(source + "\n" + neighbor))
            {
                throw new InvalidDataException(
                    $"Topology atlas contains duplicate affinity {source} -> {neighbor}.");
            }
            string path = $"$atlas.structural_affinities[{source}->{neighbor}]";
            long rank = PagesStrictJson.RequiredNonNegativeInt64(
                value,
                "rank",
                path);
            long distance = PagesStrictJson.RequiredNonNegativeInt64(
                value,
                "undirected_path_distance",
                path);
            if (rank < 1 || distance < 1)
            {
                throw new InvalidDataException(
                    $"Affinity {source} -> {neighbor} rank and path distance must be positive.");
            }
            result.Add(new PagesTopologyAtlasAffinity(
                source,
                neighbor,
                rank,
                RequiredBoolean(value, "mutual_top_k", path),
                RequiredBoolean(value, "direct_dependency", path),
                RequiredRational(value, "shared_ancestor_jaccard", path),
                RequiredRational(value, "shared_descendant_jaccard", path),
                distance,
                OptionalNonNegativeInt64(
                    value,
                    "deepest_common_prerequisite_depth",
                    path),
                RequiredRational(value, "combined_rank", path)));
        }
        return result
            .OrderBy(affinity => affinity.SourceNodeId, StringComparer.Ordinal)
            .ThenBy(affinity => affinity.Rank)
            .ThenBy(affinity => affinity.NeighborNodeId, StringComparer.Ordinal)
            .ToArray();
    }

    private static PagesTopologyAtlasHierarchyLevel[] ReadHierarchy(
        JsonElement values)
    {
        if (values.GetArrayLength() != 3)
        {
            throw new InvalidDataException(
                "Topology atlas hierarchy must contain exactly three levels.");
        }
        var result = new List<PagesTopologyAtlasHierarchyLevel>();
        foreach (JsonElement value in values.EnumerateArray())
        {
            PagesStrictJson.RequireExactProperties(
                value,
                ["level", "name", "cluster_ids"],
                "$atlas.hierarchy[]");
            int level = RequiredLevel(
                value,
                "level",
                "$atlas.hierarchy[]");
            string name = PagesStrictJson.RequiredString(
                value,
                "name",
                "$atlas.hierarchy[]");
            if (!StringComparer.Ordinal.Equals(name, LevelNames[level]))
            {
                throw new InvalidDataException(
                    $"Topology hierarchy level {level} has the wrong name.");
            }
            result.Add(new PagesTopologyAtlasHierarchyLevel(
                level,
                name,
                RequiredStringArray(
                    value,
                    "cluster_ids",
                    $"$atlas.hierarchy[{level}]",
                    clusterIds: true)));
        }
        result.Sort((left, right) => left.Level.CompareTo(right.Level));
        if (!result.Select(item => item.Level).SequenceEqual(new[] { 0, 1, 2 }))
        {
            throw new InvalidDataException(
                "Topology atlas hierarchy levels must be exactly 0, 1, and 2.");
        }
        return result.ToArray();
    }

    private static void ValidateStructure(
        IReadOnlyList<PagesTopologyAtlasCluster> clusters,
        IReadOnlyList<PagesTopologyAtlasNode> nodes,
        IReadOnlyList<PagesTopologyAtlasEdge> edges,
        IReadOnlyList<PagesTopologyAtlasAffinity> affinities,
        IReadOnlyList<PagesTopologyAtlasHierarchyLevel> hierarchy)
    {
        var clusterById = clusters.ToDictionary(
            cluster => cluster.ClusterId,
            StringComparer.Ordinal);
        var nodeById = nodes.ToDictionary(
            node => node.NodeId,
            StringComparer.Ordinal);

        for (int level = 0; level < 3; level++)
        {
            string[] expected = clusters
                .Where(cluster => cluster.Level == level)
                .Select(cluster => cluster.ClusterId)
                .Order(StringComparer.Ordinal)
                .ToArray();
            if (!expected.SequenceEqual(hierarchy[level].ClusterIds))
            {
                throw new InvalidDataException(
                    $"Topology hierarchy level {level} does not enumerate its clusters exactly.");
            }
        }

        foreach (PagesTopologyAtlasCluster cluster in clusters)
        {
            if (cluster.Level == 0 && cluster.ParentClusterId is not null)
            {
                throw new InvalidDataException(
                    $"Top-level cluster {cluster.ClusterId} cannot have a parent.");
            }
            if (cluster.Level > 0)
            {
                if (cluster.ParentClusterId is null ||
                    !clusterById.TryGetValue(
                        cluster.ParentClusterId,
                        out PagesTopologyAtlasCluster? parent) ||
                    parent.Level != cluster.Level - 1)
                {
                    throw new InvalidDataException(
                        $"Cluster {cluster.ClusterId} has an invalid parent chain.");
                }
                RequireSubset(
                    cluster.MemberNodeIds,
                    parent.MemberNodeIds,
                    $"$atlas.clusters[{cluster.ClusterId}]",
                    "member_node_ids");
            }
            foreach (string member in cluster.MemberNodeIds)
            {
                if (!nodeById.ContainsKey(member))
                {
                    throw new InvalidDataException(
                        $"Cluster {cluster.ClusterId} references unknown node {member}.");
                }
            }
        }

        foreach (PagesTopologyAtlasNode node in nodes)
        {
            if (!StringComparer.Ordinal.Equals(
                    node.ComponentId,
                    node.ClusterPath[0]))
            {
                throw new InvalidDataException(
                    $"Node {node.NodeId} component_id disagrees with cluster_path.");
            }
            for (int level = 0; level < 3; level++)
            {
                string clusterId = node.ClusterPath[level];
                if (!clusterById.TryGetValue(
                        clusterId,
                        out PagesTopologyAtlasCluster? cluster) ||
                    cluster.Level != level ||
                    !cluster.MemberNodeIds.Contains(
                        node.NodeId,
                        StringComparer.Ordinal))
                {
                    throw new InvalidDataException(
                        $"Node {node.NodeId} has an invalid cluster_path at level {level}.");
                }
                if (level > 0 && !StringComparer.Ordinal.Equals(
                        cluster.ParentClusterId,
                        node.ClusterPath[level - 1]))
                {
                    throw new InvalidDataException(
                        $"Node {node.NodeId} cluster_path is not nested.");
                }
            }
        }

        foreach (PagesTopologyAtlasEdge edge in edges)
        {
            if (!nodeById.ContainsKey(edge.DependencyId) ||
                !nodeById.ContainsKey(edge.DependentId))
            {
                throw new InvalidDataException(
                    $"Topology edge {edge.DependencyId} -> {edge.DependentId} references an unknown node.");
            }
            string sourceCluster = nodeById[edge.DependencyId].ClusterPath[2];
            string targetCluster = nodeById[edge.DependentId].ClusterPath[2];
            if (!StringComparer.Ordinal.Equals(sourceCluster, edge.SourceClusterId) ||
                !StringComparer.Ordinal.Equals(targetCluster, edge.TargetClusterId))
            {
                throw new InvalidDataException(
                    $"Topology edge {edge.DependencyId} -> {edge.DependentId} has inconsistent cluster endpoints.");
            }
            string expectedRelation = StringComparer.Ordinal.Equals(
                sourceCluster,
                targetCluster)
                ? "intra-cluster"
                : "inter-cluster";
            if (!StringComparer.Ordinal.Equals(
                    expectedRelation,
                    edge.ClusterRelation))
            {
                throw new InvalidDataException(
                    $"Topology edge {edge.DependencyId} -> {edge.DependentId} has an inconsistent cluster relation.");
            }
        }

        foreach (PagesTopologyAtlasAffinity affinity in affinities)
        {
            if (!nodeById.ContainsKey(affinity.SourceNodeId) ||
                !nodeById.ContainsKey(affinity.NeighborNodeId))
            {
                throw new InvalidDataException(
                    $"Topology affinity {affinity.SourceNodeId} -> {affinity.NeighborNodeId} references an unknown node.");
            }
        }
    }

    private static string RequiredDigest(JsonElement parent, string name)
    {
        string value = PagesStrictJson.RequiredString(
            parent,
            name,
            "$atlas");
        PagesStrictJson.RequireSha256(value, $"$atlas.{name}");
        return value;
    }

    private static string RequiredClusterId(
        JsonElement parent,
        string name,
        string path)
    {
        string value = PagesStrictJson.RequiredString(parent, name, path);
        RequireClusterId(value, $"{path}.{name}");
        return value;
    }

    private static string? NullableClusterId(
        JsonElement parent,
        string name,
        string path)
    {
        if (!parent.TryGetProperty(name, out JsonElement value))
        {
            throw new InvalidDataException($"{path}.{name} is required.");
        }
        if (value.ValueKind == JsonValueKind.Null)
        {
            return null;
        }
        if (value.ValueKind != JsonValueKind.String ||
            string.IsNullOrWhiteSpace(value.GetString()))
        {
            throw new InvalidDataException(
                $"{path}.{name} must be a cluster id or null.");
        }
        string result = value.GetString()!;
        RequireClusterId(result, $"{path}.{name}");
        return result;
    }

    private static void RequireClusterId(string value, string path)
    {
        const string prefix = "cluster:sha256:";
        if (value.Length != prefix.Length + 64 ||
            !value.StartsWith(prefix, StringComparison.Ordinal) ||
            value.AsSpan(prefix.Length).Any(character =>
                character is not (>= '0' and <= '9') and
                not (>= 'a' and <= 'f')))
        {
            throw new InvalidDataException(
                $"{path} must use cluster:sha256:<64 lowercase hex>.");
        }
    }

    private static int RequiredLevel(
        JsonElement parent,
        string name,
        string path)
    {
        long value = PagesStrictJson.RequiredNonNegativeInt64(
            parent,
            name,
            path);
        if (value > 2)
        {
            throw new InvalidDataException(
                $"{path}.{name} must be between 0 and 2.");
        }
        return (int)value;
    }

    private static string[] RequiredStringArray(
        JsonElement parent,
        string name,
        string path,
        int minimum = 0,
        int? maximum = null,
        bool clusterIds = false)
    {
        JsonElement values = PagesStrictJson.RequiredProperty(
            parent,
            name,
            JsonValueKind.Array,
            path);
        var result = new List<string>();
        var seen = new HashSet<string>(StringComparer.Ordinal);
        foreach (JsonElement value in values.EnumerateArray())
        {
            if (value.ValueKind != JsonValueKind.String ||
                string.IsNullOrWhiteSpace(value.GetString()))
            {
                throw new InvalidDataException(
                    $"{path}.{name} must contain non-empty strings.");
            }
            string item = value.GetString()!;
            if (clusterIds)
            {
                RequireClusterId(item, $"{path}.{name}[]");
            }
            if (!seen.Add(item))
            {
                throw new InvalidDataException(
                    $"{path}.{name} contains duplicate value {item}.");
            }
            result.Add(item);
        }
        if (result.Count < minimum ||
            maximum is not null && result.Count > maximum.Value)
        {
            throw new InvalidDataException(
                $"{path}.{name} has an invalid item count.");
        }
        string[] sorted = result.Order(StringComparer.Ordinal).ToArray();
        if (!result.SequenceEqual(sorted))
        {
            throw new InvalidDataException(
                $"{path}.{name} must use ordinal canonical ordering.");
        }
        return result.ToArray();
    }

    private static void RequireSubset(
        IReadOnlyList<string> values,
        IReadOnlyList<string> members,
        string path,
        string name)
    {
        var set = members.ToHashSet(StringComparer.Ordinal);
        string? unknown = values.FirstOrDefault(value => !set.Contains(value));
        if (unknown is not null)
        {
            throw new InvalidDataException(
                $"{path}.{name} contains non-member {unknown}.");
        }
    }

    private static bool RequiredBoolean(
        JsonElement parent,
        string name,
        string path) =>
        PagesStrictJson.RequiredProperty(
            parent,
            name,
            JsonValueKind.True,
            path).GetBoolean();

    private static long? OptionalNonNegativeInt64(
        JsonElement parent,
        string name,
        string path)
    {
        if (!parent.TryGetProperty(name, out JsonElement value))
        {
            throw new InvalidDataException($"{path}.{name} is required.");
        }
        if (value.ValueKind == JsonValueKind.Null)
        {
            return null;
        }
        if (value.ValueKind != JsonValueKind.Number ||
            !value.TryGetInt64(out long result) ||
            result < 0)
        {
            throw new InvalidDataException(
                $"{path}.{name} must be a non-negative integer or null.");
        }
        return result;
    }

    private static PagesAtlasRational RequiredRational(
        JsonElement parent,
        string name,
        string path)
    {
        JsonElement value = PagesStrictJson.RequiredProperty(
            parent,
            name,
            JsonValueKind.Object,
            path);
        PagesStrictJson.RequireExactProperties(
            value,
            ["numerator", "denominator"],
            $"{path}.{name}");
        return new PagesAtlasRational(
            PagesStrictJson.RequiredBigInteger(
                value,
                "numerator",
                $"{path}.{name}"),
            PagesStrictJson.RequiredBigInteger(
                value,
                "denominator",
                $"{path}.{name}"));
    }
}
