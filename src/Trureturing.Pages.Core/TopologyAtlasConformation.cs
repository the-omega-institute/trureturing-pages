using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace Trureturing.Pages.Core;

public static class PagesTopologyAtlasConformationSchemas
{
    public const string LayoutProfile =
        "pages-topology-atlas-fixed-point-v1";
    public const int CoordinateScale = 1000;
    public const long DepthStep = 180_000;
    public const long ComponentSpacing = 1_800_000;
    public const long BridgeBlockSpacing = 560_000;
    public const long CommunitySpacing = 210_000;
    public const long NodeSpacing = 56_000;
    public const int RelaxationPasses = 10;

    private const string CanonicalProfile =
        "pages-topology-atlas-fixed-point-v1\n" +
        "coordinate-scale=1000\n" +
        "depth-step=180000\n" +
        "component-spacing=1800000\n" +
        "bridge-block-spacing=560000\n" +
        "community-spacing=210000\n" +
        "node-spacing=56000\n" +
        "relaxation-passes=10\n" +
        "certified-neighbor-weight=3\n" +
        "affinity-neighbor-weight=1\n" +
        "cluster-centroid-weight=2\n" +
        "role-radial-placement=v1\n" +
        "alignment=three-quarter-previous-one-quarter-intrinsic\n";

    public static string LayoutProfileDigest { get; } =
        PagesStrictJson.Sha256(
            Encoding.UTF8.GetBytes(CanonicalProfile));
}

public static class PagesTopologyAtlasConformation
{
    private static readonly HashSet<string> CertifiedLayers =
        new(StringComparer.Ordinal)
        {
            "truth-dependency",
            "module-import",
            "frozen-prerequisite"
        };

    public static PagesConformationArtifacts Build(
        ReadOnlySpan<byte> atlasGraphBytes,
        ReadOnlySpan<byte> atlasManifestBytes,
        ReadOnlySpan<byte> previousConformationBytes = default)
    {
        using JsonDocument graphDocument = PagesStrictJson.Parse(
            atlasGraphBytes,
            "Pages topology atlas graph");
        using JsonDocument manifestDocument = PagesStrictJson.Parse(
            atlasManifestBytes,
            "Pages topology atlas manifest");
        Binding binding = Binding.Read(
            atlasGraphBytes,
            graphDocument.RootElement,
            manifestDocument.RootElement);
        GraphModel graph = GraphModel.Read(graphDocument.RootElement);
        PreviousModel? previous = previousConformationBytes.IsEmpty
            ? null
            : PreviousModel.Read(previousConformationBytes);

        Dictionary<string, PagesConformationPoint> clusterSeeds =
            BuildClusterSeeds(graph.Clusters);
        IReadOnlyList<RegionModel> regions = BuildRegions(
            graph,
            clusterSeeds);
        Dictionary<string, PagesConformationPoint> intrinsic =
            SeedNodes(graph, regions);
        Relax(graph, regions, intrinsic);
        ApplyStructuralRoles(graph, regions, intrinsic);
        ResolveCollisions(graph, intrinsic);
        Dictionary<string, PagesConformationPoint> aligned = Align(
            graph,
            intrinsic,
            previous);

        IReadOnlyList<PagesConformationNode> nodeRecords = graph.Nodes
            .OrderBy(node => node.Id, StringComparer.Ordinal)
            .Select(node => new PagesConformationNode(
                node.Id,
                node.RegionId,
                node.Depth,
                intrinsic[node.Id],
                aligned[node.Id],
                MovementReasons(node, intrinsic[node.Id], previous)))
            .ToArray();
        IReadOnlyList<PagesConformationRegion> regionRecords = regions
            .OrderBy(region => region.RegionId, StringComparer.Ordinal)
            .Select(region => new PagesConformationRegion(
                region.RegionId,
                region.Label,
                region.Authority,
                region.MemberNodeIds,
                Centroid(region.MemberNodeIds.Select(id => intrinsic[id])),
                Centroid(region.MemberNodeIds.Select(id => aligned[id])),
                region.MemberNodeIds.Min(id => graph.NodeById[id].Depth),
                region.MemberNodeIds.Max(id => graph.NodeById[id].Depth)))
            .ToArray();

        var conformation = new PagesConformationDocument(
            PagesConformationSchemas.Conformation,
            binding.TruthReleaseDigest,
            binding.AtlasGraphDigest,
            binding.CertifiedTopologyDigest,
            binding.TopologyAtlasDigest,
            new PagesConformationProfile(
                PagesTopologyAtlasConformationSchemas.LayoutProfile,
                PagesTopologyAtlasConformationSchemas.LayoutProfileDigest),
            "topology-atlas.v1",
            previous is null
                ? null
                : PagesStrictJson.Sha256(previousConformationBytes),
            new PagesCoordinateEncoding(
                "signed-fixed-point",
                PagesTopologyAtlasConformationSchemas.CoordinateScale),
            new PagesConformationAxes(
                "y",
                PagesTopologyAtlasConformationSchemas.DepthStep),
            regionRecords,
            nodeRecords,
            BuildCameraPresets(nodeRecords));

        byte[] conformationBytes = PagesStrictJson.SerializeValue(conformation);
        string conformationDigest = PagesStrictJson.Sha256(conformationBytes);
        JsonObject boundManifest = JsonNode.Parse(
            manifestDocument.RootElement.GetRawText())?.AsObject()
            ?? throw new InvalidDataException(
                "Pages topology atlas manifest is null.");
        boundManifest["conformation_digest"] = conformationDigest;
        return new PagesConformationArtifacts(
            conformationBytes,
            PagesStrictJson.SerializeNode(boundManifest),
            conformation,
            conformationDigest);
    }

    private static Dictionary<string, PagesConformationPoint>
        BuildClusterSeeds(
            IReadOnlyList<ClusterModel> clusters)
    {
        var result = new Dictionary<string, PagesConformationPoint>(
            StringComparer.Ordinal);
        ClusterModel[] components = clusters
            .Where(cluster => cluster.Level == 0)
            .OrderBy(cluster => cluster.ClusterId, StringComparer.Ordinal)
            .ToArray();
        for (int index = 0; index < components.Length; index++)
        {
            (int x, int z) = SquareSpiral(index);
            result[components[index].ClusterId] =
                new PagesConformationPoint(
                    x * PagesTopologyAtlasConformationSchemas.ComponentSpacing,
                    0,
                    z * PagesTopologyAtlasConformationSchemas.ComponentSpacing);
        }

        foreach (ClusterModel parent in components)
        {
            PlaceChildren(
                parent,
                clusters,
                result,
                level: 1,
                PagesTopologyAtlasConformationSchemas.BridgeBlockSpacing);
        }
        foreach (ClusterModel parent in clusters
            .Where(cluster => cluster.Level == 1)
            .OrderBy(cluster => cluster.ClusterId, StringComparer.Ordinal))
        {
            PlaceChildren(
                parent,
                clusters,
                result,
                level: 2,
                PagesTopologyAtlasConformationSchemas.CommunitySpacing);
        }
        return result;
    }

    private static void PlaceChildren(
        ClusterModel parent,
        IReadOnlyList<ClusterModel> clusters,
        IDictionary<string, PagesConformationPoint> seeds,
        int level,
        long spacing)
    {
        ClusterModel[] children = clusters
            .Where(cluster => cluster.Level == level &&
                StringComparer.Ordinal.Equals(
                    cluster.ParentClusterId,
                    parent.ClusterId))
            .OrderBy(cluster => cluster.ClusterId, StringComparer.Ordinal)
            .ToArray();
        PagesConformationPoint origin = seeds[parent.ClusterId];
        for (int index = 0; index < children.Length; index++)
        {
            (int x, int z) = SquareSpiral(index + 1);
            seeds[children[index].ClusterId] =
                new PagesConformationPoint(
                    origin.X + x * spacing,
                    0,
                    origin.Z + z * spacing);
        }
    }

    private static IReadOnlyList<RegionModel> BuildRegions(
        GraphModel graph,
        IReadOnlyDictionary<string, PagesConformationPoint> clusterSeeds)
    {
        var result = new List<RegionModel>();
        foreach (ClusterModel cluster in graph.Clusters
            .Where(item => item.Level == 2)
            .OrderBy(item => item.ClusterId, StringComparer.Ordinal))
        {
            if (!clusterSeeds.TryGetValue(
                    cluster.ClusterId,
                    out PagesConformationPoint? seed))
            {
                throw new InvalidDataException(
                    $"Topology cluster {cluster.ClusterId} has no conformation seed.");
            }
            result.Add(new RegionModel(
                cluster.ClusterId,
                cluster.Label,
                "topology-atlas-derived",
                cluster.MemberNodeIds,
                seed));
        }

        NodeModel[] semantic = graph.Nodes
            .Where(node => node.Kind != "truth")
            .OrderBy(node => node.Id, StringComparer.Ordinal)
            .ToArray();
        foreach (IGrouping<string, NodeModel> group in semantic
            .GroupBy(node => node.RegionId, StringComparer.Ordinal)
            .OrderBy(group => group.Key, StringComparer.Ordinal))
        {
            string[] members = group.Select(node => node.Id)
                .Order(StringComparer.Ordinal)
                .ToArray();
            int offset = result.Count + 1;
            (int x, int z) = SquareSpiral(offset);
            result.Add(new RegionModel(
                group.Key,
                group.First().RegionLabel,
                "pages-derived-fallback",
                members,
                new PagesConformationPoint(
                    x * PagesTopologyAtlasConformationSchemas.ComponentSpacing,
                    0,
                    z * PagesTopologyAtlasConformationSchemas.ComponentSpacing)));
        }

        string[] covered = result.SelectMany(region => region.MemberNodeIds)
            .Order(StringComparer.Ordinal)
            .ToArray();
        string[] expected = graph.Nodes.Select(node => node.Id)
            .Order(StringComparer.Ordinal)
            .ToArray();
        if (!covered.SequenceEqual(expected))
        {
            throw new InvalidDataException(
                "Topology Atlas conformation regions do not close over every displayed node.");
        }
        return result;
    }

    private static Dictionary<string, PagesConformationPoint> SeedNodes(
        GraphModel graph,
        IReadOnlyList<RegionModel> regions)
    {
        var result = new Dictionary<string, PagesConformationPoint>(
            StringComparer.Ordinal);
        foreach (RegionModel region in regions)
        {
            NodeModel[] members = region.MemberNodeIds
                .Select(id => graph.NodeById[id])
                .OrderBy(node => node.Depth)
                .ThenBy(node => node.Id, StringComparer.Ordinal)
                .ToArray();
            foreach (IGrouping<long, NodeModel> level in members
                .GroupBy(node => node.Depth)
                .OrderBy(group => group.Key))
            {
                NodeModel[] nodes = level
                    .OrderBy(node => RoleOrder(node.StructuralRole))
                    .ThenBy(node => node.Id, StringComparer.Ordinal)
                    .ToArray();
                int columns = CeilingSquareRoot(nodes.Length);
                int rows = (nodes.Length + columns - 1) / columns;
                for (int index = 0; index < nodes.Length; index++)
                {
                    int column = index % columns;
                    int row = index / columns;
                    long offsetX =
                        (2L * column - (columns - 1L)) *
                        PagesTopologyAtlasConformationSchemas.NodeSpacing / 2;
                    long offsetZ =
                        (2L * row - (rows - 1L)) *
                        PagesTopologyAtlasConformationSchemas.NodeSpacing / 2;
                    result[nodes[index].Id] = new PagesConformationPoint(
                        region.SeedCentroid.X + offsetX,
                        level.Key * PagesTopologyAtlasConformationSchemas.DepthStep,
                        region.SeedCentroid.Z + offsetZ);
                }
            }
        }
        return result;
    }

    private static void Relax(
        GraphModel graph,
        IReadOnlyList<RegionModel> regions,
        IDictionary<string, PagesConformationPoint> positions)
    {
        var regionByNode = regions.SelectMany(region =>
                region.MemberNodeIds.Select(id => (id, region)))
            .ToDictionary(pair => pair.id, pair => pair.region, StringComparer.Ordinal);
        for (int pass = 0;
            pass < PagesTopologyAtlasConformationSchemas.RelaxationPasses;
            pass++)
        {
            var next = new Dictionary<string, PagesConformationPoint>(
                StringComparer.Ordinal);
            foreach (NodeModel node in graph.Nodes
                .OrderBy(item => item.Id, StringComparer.Ordinal))
            {
                PagesConformationPoint current = positions[node.Id];
                RegionModel region = regionByNode[node.Id];
                string[] certified = graph.CertifiedNeighbors[node.Id]
                    .Where(positions.ContainsKey)
                    .Order(StringComparer.Ordinal)
                    .ToArray();
                string[] affinities = graph.AffinityNeighbors[node.Id]
                    .Where(positions.ContainsKey)
                    .Order(StringComparer.Ordinal)
                    .ToArray();
                long numeratorX = 5 * current.X + 2 * region.SeedCentroid.X;
                long numeratorZ = 5 * current.Z + 2 * region.SeedCentroid.Z;
                long denominator = 7;
                if (certified.Length > 0)
                {
                    numeratorX += 3 * Average(
                        certified.Select(id => positions[id].X));
                    numeratorZ += 3 * Average(
                        certified.Select(id => positions[id].Z));
                    denominator += 3;
                }
                if (affinities.Length > 0)
                {
                    numeratorX += Average(
                        affinities.Select(id => positions[id].X));
                    numeratorZ += Average(
                        affinities.Select(id => positions[id].Z));
                    denominator += 1;
                }
                next[node.Id] = new PagesConformationPoint(
                    Quantize(numeratorX / denominator),
                    current.Y,
                    Quantize(numeratorZ / denominator));
            }
            foreach ((string id, PagesConformationPoint point) in next)
            {
                positions[id] = point;
            }
        }
    }

    private static void ApplyStructuralRoles(
        GraphModel graph,
        IReadOnlyList<RegionModel> regions,
        IDictionary<string, PagesConformationPoint> positions)
    {
        var regionByNode = regions.SelectMany(region =>
                region.MemberNodeIds.Select(id => (id, region)))
            .ToDictionary(pair => pair.id, pair => pair.region, StringComparer.Ordinal);
        foreach (NodeModel node in graph.Nodes
            .OrderBy(item => item.Id, StringComparer.Ordinal))
        {
            if (node.Kind != "truth")
            {
                continue;
            }
            RegionModel region = regionByNode[node.Id];
            PagesConformationPoint point = positions[node.Id];
            long dx = point.X - region.SeedCentroid.X;
            long dz = point.Z - region.SeedCentroid.Z;
            if (dx == 0 && dz == 0)
            {
                int direction = StableDirection(node.Id);
                dx = direction is 0 or 2
                    ? PagesTopologyAtlasConformationSchemas.NodeSpacing
                    : 0;
                dz = direction is 1 or 3
                    ? PagesTopologyAtlasConformationSchemas.NodeSpacing
                    : 0;
                if (direction is 2) dx = -dx;
                if (direction is 3) dz = -dz;
            }
            (long numerator, long denominator) = node.StructuralRole switch
            {
                "foundation" or "hub" => (3, 4),
                "bridge" or "interface" => (3, 2),
                "frontier-adjacent" or "specialized-leaf" => (5, 4),
                _ => (1, 1)
            };
            positions[node.Id] = new PagesConformationPoint(
                Quantize(region.SeedCentroid.X + dx * numerator / denominator),
                point.Y,
                Quantize(region.SeedCentroid.Z + dz * numerator / denominator));
        }
    }

    private static void ResolveCollisions(
        GraphModel graph,
        IDictionary<string, PagesConformationPoint> positions)
    {
        foreach (IGrouping<(string Region, long Depth), NodeModel> group in
            graph.Nodes.GroupBy(node => (node.RegionId, node.Depth)))
        {
            var occupied = new HashSet<(long X, long Z)>();
            foreach (NodeModel node in group
                .OrderBy(item => positions[item.Id].X)
                .ThenBy(item => positions[item.Id].Z)
                .ThenBy(item => item.Id, StringComparer.Ordinal))
            {
                PagesConformationPoint point = positions[node.Id];
                long x = point.X;
                while (!occupied.Add((x, point.Z)))
                {
                    x += PagesTopologyAtlasConformationSchemas.NodeSpacing;
                }
                positions[node.Id] = point with { X = x };
            }
        }
    }

    private static Dictionary<string, PagesConformationPoint> Align(
        GraphModel graph,
        IReadOnlyDictionary<string, PagesConformationPoint> intrinsic,
        PreviousModel? previous)
    {
        var result = new Dictionary<string, PagesConformationPoint>(
            StringComparer.Ordinal);
        foreach (NodeModel node in graph.Nodes
            .OrderBy(item => item.Id, StringComparer.Ordinal))
        {
            PagesConformationPoint current = intrinsic[node.Id];
            if (previous is null)
            {
                result[node.Id] = current;
                continue;
            }
            if (previous.Nodes.TryGetValue(node.Id, out PreviousNode? prior))
            {
                result[node.Id] = new PagesConformationPoint(
                    Quantize((3 * prior.Aligned.X + current.X) / 4),
                    current.Y,
                    Quantize((3 * prior.Aligned.Z + current.Z) / 4));
                continue;
            }
            PreviousNode[] neighbors = graph.CertifiedNeighbors[node.Id]
                .Where(previous.Nodes.ContainsKey)
                .Select(id => previous.Nodes[id])
                .OrderBy(item => item.NodeId, StringComparer.Ordinal)
                .ToArray();
            if (neighbors.Length == 0)
            {
                result[node.Id] = current;
                continue;
            }
            result[node.Id] = new PagesConformationPoint(
                Quantize((2 * Average(neighbors.Select(item => item.Aligned.X)) + current.X) / 3),
                current.Y,
                Quantize((2 * Average(neighbors.Select(item => item.Aligned.Z)) + current.Z) / 3));
        }
        return result;
    }

    private static IReadOnlyList<string> MovementReasons(
        NodeModel node,
        PagesConformationPoint intrinsic,
        PreviousModel? previous)
    {
        if (previous is null)
        {
            return ["topology-atlas-placement"];
        }
        if (!previous.Nodes.TryGetValue(node.Id, out PreviousNode? prior))
        {
            return ["new-node-certified-neighborhood-seed"];
        }
        var reasons = new List<string> { "retained-node-alignment" };
        if (prior.TrueDepth != node.Depth)
        {
            reasons.Add("certified-depth-changed");
        }
        if (!StringComparer.Ordinal.Equals(prior.RegionId, node.RegionId))
        {
            reasons.Add("topology-cluster-changed");
        }
        if (prior.Intrinsic.X != intrinsic.X ||
            prior.Intrinsic.Z != intrinsic.Z)
        {
            reasons.Add("intrinsic-structure-changed");
        }
        return reasons;
    }

    private static IReadOnlyList<PagesConformationCameraPreset>
        BuildCameraPresets(IReadOnlyList<PagesConformationNode> nodes)
    {
        PagesConformationPoint center = nodes.Count == 0
            ? new PagesConformationPoint(0, 0, 0)
            : Centroid(nodes.Select(node => node.Aligned));
        long horizontalRadius = nodes.Count == 0
            ? PagesTopologyAtlasConformationSchemas.ComponentSpacing
            : nodes.Max(node => Math.Max(
                Math.Abs(node.Aligned.X - center.X),
                Math.Abs(node.Aligned.Z - center.Z)));
        long verticalRadius = nodes.Count == 0
            ? PagesTopologyAtlasConformationSchemas.DepthStep
            : nodes.Max(node => Math.Abs(node.Aligned.Y - center.Y));
        long distance = Math.Max(
            PagesTopologyAtlasConformationSchemas.ComponentSpacing,
            horizontalRadius + verticalRadius +
            PagesTopologyAtlasConformationSchemas.ComponentSpacing);
        return
        [
            new PagesConformationCameraPreset(
                "overview",
                new PagesConformationPoint(
                    center.X + distance,
                    center.Y + distance / 2,
                    center.Z + distance),
                center)
        ];
    }

    private static PagesConformationPoint Centroid(
        IEnumerable<PagesConformationPoint> points)
    {
        PagesConformationPoint[] values = points.ToArray();
        return values.Length == 0
            ? new PagesConformationPoint(0, 0, 0)
            : new PagesConformationPoint(
                Average(values.Select(point => point.X)),
                Average(values.Select(point => point.Y)),
                Average(values.Select(point => point.Z)));
    }

    private static long Average(IEnumerable<long> values)
    {
        long[] items = values.ToArray();
        if (items.Length == 0) return 0;
        long sum = 0;
        foreach (long item in items)
        {
            sum = checked(sum + item);
        }
        return sum / items.Length;
    }

    private static long Quantize(long value)
    {
        const long quantum = 100;
        return value >= 0
            ? ((value + quantum / 2) / quantum) * quantum
            : ((value - quantum / 2) / quantum) * quantum;
    }

    private static int CeilingSquareRoot(int value)
    {
        int root = 1;
        while (checked(root * root) < Math.Max(1, value)) root++;
        return root;
    }

    private static int RoleOrder(string role) => role switch
    {
        "foundation" => 0,
        "hub" => 1,
        "internal" => 2,
        "bridge" => 3,
        "interface" => 4,
        "frontier-adjacent" => 5,
        "specialized-leaf" => 6,
        _ => 7
    };

    private static int StableDirection(string value)
    {
        uint hash = 2166136261;
        foreach (char character in value)
        {
            hash ^= character;
            hash *= 16777619;
        }
        return (int)(hash % 4);
    }

    private static (int X, int Z) SquareSpiral(int index)
    {
        if (index == 0) return (0, 0);
        int x = 0;
        int z = 0;
        int direction = 0;
        int stepLength = 1;
        int visited = 0;
        while (visited < index)
        {
            for (int repeat = 0; repeat < 2; repeat++)
            {
                for (int step = 0; step < stepLength && visited < index; step++)
                {
                    switch (direction % 4)
                    {
                        case 0: x++; break;
                        case 1: z++; break;
                        case 2: x--; break;
                        default: z--; break;
                    }
                    visited++;
                }
                direction++;
            }
            stepLength++;
        }
        return (x, z);
    }

    private static string SemanticRegionId(string label)
    {
        byte[] digest = SHA256.HashData(
            Encoding.UTF8.GetBytes(
                PagesTopologyAtlasConformationSchemas.LayoutProfileDigest +
                "\nsemantic\n" + label));
        return "region:sha256:" + Convert.ToHexStringLower(digest);
    }

    private sealed record Binding(
        string TruthReleaseDigest,
        string AtlasGraphDigest,
        string CertifiedTopologyDigest,
        string TopologyAtlasDigest)
    {
        public static Binding Read(
            ReadOnlySpan<byte> graphBytes,
            JsonElement graph,
            JsonElement manifest)
        {
            string graphSchema = PagesStrictJson.RequiredString(
                graph,
                "schema_version",
                "$graph");
            string manifestSchema = PagesStrictJson.RequiredString(
                manifest,
                "schema_version",
                "$manifest");
            if (!StringComparer.Ordinal.Equals(
                    graphSchema,
                    PagesAtlasSchemas.AtlasView) ||
                !StringComparer.Ordinal.Equals(
                    manifestSchema,
                    PagesAtlasSchemas.AtlasManifest))
            {
                throw new InvalidDataException(
                    "Topology Atlas conformation requires the current Pages Atlas schemas.");
            }
            string release = PagesStrictJson.RequiredString(
                manifest,
                "truth_release_digest",
                "$manifest");
            string graphDigest = PagesStrictJson.RequiredString(
                manifest,
                "atlas_graph_digest",
                "$manifest");
            string certifiedDigest = PagesStrictJson.RequiredString(
                manifest,
                "certified_topology_digest",
                "$manifest");
            string topologyAtlasDigest = PagesStrictJson.RequiredString(
                manifest,
                "topology_atlas_digest",
                "$manifest");
            foreach ((string value, string path) in new[]
            {
                (release, "$manifest.truth_release_digest"),
                (graphDigest, "$manifest.atlas_graph_digest"),
                (certifiedDigest, "$manifest.certified_topology_digest"),
                (topologyAtlasDigest, "$manifest.topology_atlas_digest")
            })
            {
                PagesStrictJson.RequireSha256(value, path);
            }
            if (!StringComparer.Ordinal.Equals(
                    graphDigest,
                    PagesStrictJson.Sha256(graphBytes)))
            {
                throw new InvalidDataException(
                    "Pages manifest does not bind the exact structured Atlas graph bytes.");
            }
            JsonElement snapshot = PagesStrictJson.RequiredProperty(
                graph,
                "source_snapshot",
                JsonValueKind.Object,
                "$graph");
            JsonElement atlas = PagesStrictJson.RequiredProperty(
                graph,
                "topology_atlas",
                JsonValueKind.Object,
                "$graph");
            if (!StringComparer.Ordinal.Equals(
                    release,
                    PagesStrictJson.RequiredString(
                        snapshot,
                        "truth_release_digest",
                        "$graph.source_snapshot")) ||
                !StringComparer.Ordinal.Equals(
                    certifiedDigest,
                    PagesStrictJson.RequiredString(
                        snapshot,
                        "certified_topology_digest",
                        "$graph.source_snapshot")) ||
                !StringComparer.Ordinal.Equals(
                    topologyAtlasDigest,
                    PagesStrictJson.RequiredString(
                        atlas,
                        "digest",
                        "$graph.topology_atlas")))
            {
                throw new InvalidDataException(
                    "Structured Atlas graph and manifest use different release bindings.");
            }
            if (manifest.TryGetProperty(
                    "conformation_digest",
                    out JsonElement existing) &&
                existing.ValueKind != JsonValueKind.Null)
            {
                throw new InvalidDataException(
                    "Input Atlas manifest is already bound to a conformation.");
            }
            return new Binding(
                release,
                graphDigest,
                certifiedDigest,
                topologyAtlasDigest);
        }
    }

    private sealed record ClusterModel(
        string ClusterId,
        string? ParentClusterId,
        int Level,
        string Label,
        IReadOnlyList<string> MemberNodeIds);

    private sealed record NodeModel(
        string Id,
        string Kind,
        long Depth,
        string RegionId,
        string RegionLabel,
        string StructuralRole);

    private sealed record RegionModel(
        string RegionId,
        string Label,
        string Authority,
        IReadOnlyList<string> MemberNodeIds,
        PagesConformationPoint SeedCentroid);

    private sealed record GraphModel(
        IReadOnlyList<ClusterModel> Clusters,
        IReadOnlyList<NodeModel> Nodes,
        IReadOnlyDictionary<string, NodeModel> NodeById,
        IReadOnlyDictionary<string, IReadOnlyList<string>> CertifiedNeighbors,
        IReadOnlyDictionary<string, IReadOnlyList<string>> AffinityNeighbors)
    {
        public static GraphModel Read(JsonElement root)
        {
            JsonElement clusterValues = PagesStrictJson.RequiredProperty(
                root,
                "clusters",
                JsonValueKind.Array,
                "$graph");
            var clusters = new List<ClusterModel>();
            var clusterById = new Dictionary<string, ClusterModel>(
                StringComparer.Ordinal);
            foreach (JsonElement value in clusterValues.EnumerateArray())
            {
                string id = PagesStrictJson.RequiredString(
                    value,
                    "cluster_id",
                    "$graph.clusters[]");
                int level = value.GetProperty("level").GetInt32();
                string? parent = value.GetProperty("parent_cluster_id").ValueKind ==
                    JsonValueKind.Null
                    ? null
                    : value.GetProperty("parent_cluster_id").GetString();
                string label = PagesStrictJson.RequiredString(
                    value,
                    "display_label",
                    $"$graph.clusters[{id}]");
                string[] members = value.GetProperty("member_node_ids")
                    .EnumerateArray()
                    .Select(item => item.GetString() ?? string.Empty)
                    .Order(StringComparer.Ordinal)
                    .ToArray();
                var cluster = new ClusterModel(id, parent, level, label, members);
                if (!clusterById.TryAdd(id, cluster))
                {
                    throw new InvalidDataException(
                        $"Structured Pages graph contains duplicate cluster {id}.");
                }
                clusters.Add(cluster);
            }

            JsonElement nodeValues = PagesStrictJson.RequiredProperty(
                root,
                "nodes",
                JsonValueKind.Array,
                "$graph");
            var nodes = new List<NodeModel>();
            var nodeById = new Dictionary<string, NodeModel>(
                StringComparer.Ordinal);
            foreach (JsonElement value in nodeValues.EnumerateArray())
            {
                string id = PagesStrictJson.RequiredString(
                    value,
                    "id",
                    "$graph.nodes[]");
                string kind = OptionalString(value, "kind") ?? "semantic";
                long depth = OptionalDepth(value);
                string regionId;
                string label;
                string role;
                if (StringComparer.Ordinal.Equals(kind, "truth"))
                {
                    regionId = PagesStrictJson.RequiredString(
                        value,
                        "atlas_cluster_id",
                        $"$graph.nodes[{id}]");
                    if (!clusterById.TryGetValue(
                            regionId,
                            out ClusterModel? cluster) ||
                        cluster.Level != 2)
                    {
                        throw new InvalidDataException(
                            $"Truth node {id} does not reference a leaf Topology cluster.");
                    }
                    label = cluster.Label;
                    role = PagesStrictJson.RequiredString(
                        value,
                        "structural_role",
                        $"$graph.nodes[{id}]");
                }
                else
                {
                    label = "Documents · " + kind;
                    regionId = SemanticRegionId(label);
                    role = "semantic";
                }
                var node = new NodeModel(
                    id,
                    kind,
                    depth,
                    regionId,
                    label,
                    role);
                if (!nodeById.TryAdd(id, node))
                {
                    throw new InvalidDataException(
                        $"Structured Pages graph contains duplicate node {id}.");
                }
                nodes.Add(node);
            }

            var certified = nodeById.Keys.ToDictionary(
                id => id,
                _ => new SortedSet<string>(StringComparer.Ordinal),
                StringComparer.Ordinal);
            var affinity = nodeById.Keys.ToDictionary(
                id => id,
                _ => new SortedSet<string>(StringComparer.Ordinal),
                StringComparer.Ordinal);
            JsonElement edgeValues = PagesStrictJson.RequiredProperty(
                root,
                "edges",
                JsonValueKind.Array,
                "$graph");
            foreach (JsonElement value in edgeValues.EnumerateArray())
            {
                string? source = EndpointId(value, "source");
                string? target = EndpointId(value, "target");
                if (source is null || target is null ||
                    !nodeById.ContainsKey(source) ||
                    !nodeById.ContainsKey(target) ||
                    StringComparer.Ordinal.Equals(source, target))
                {
                    continue;
                }
                string layer = OptionalString(value, "layer") ?? string.Empty;
                string status = OptionalString(value, "status") ?? string.Empty;
                if (CertifiedLayers.Contains(layer) ||
                    StringComparer.Ordinal.Equals(status, "certified"))
                {
                    certified[source].Add(target);
                    certified[target].Add(source);
                }
                else if (StringComparer.Ordinal.Equals(
                    layer,
                    "structural-affinity"))
                {
                    affinity[source].Add(target);
                    affinity[target].Add(source);
                }
            }

            foreach (NodeModel node in nodes.Where(item => item.Kind == "truth"))
            {
                if (!clusterById[node.RegionId].MemberNodeIds.Contains(
                        node.Id,
                        StringComparer.Ordinal))
                {
                    throw new InvalidDataException(
                        $"Topology cluster {node.RegionId} does not contain projected truth node {node.Id}.");
                }
            }

            return new GraphModel(
                clusters.OrderBy(cluster => cluster.Level)
                    .ThenBy(cluster => cluster.ClusterId, StringComparer.Ordinal)
                    .ToArray(),
                nodes.OrderBy(node => node.Id, StringComparer.Ordinal).ToArray(),
                nodeById,
                certified.ToDictionary(
                    pair => pair.Key,
                    pair => (IReadOnlyList<string>)pair.Value.ToArray(),
                    StringComparer.Ordinal),
                affinity.ToDictionary(
                    pair => pair.Key,
                    pair => (IReadOnlyList<string>)pair.Value.ToArray(),
                    StringComparer.Ordinal));
        }

        private static string? EndpointId(JsonElement edge, string name)
        {
            if (!edge.TryGetProperty(name, out JsonElement endpoint)) return null;
            if (endpoint.ValueKind == JsonValueKind.String)
            {
                return endpoint.GetString();
            }
            if (endpoint.ValueKind == JsonValueKind.Object &&
                endpoint.TryGetProperty("id", out JsonElement id) &&
                id.ValueKind == JsonValueKind.String)
            {
                return id.GetString();
            }
            return null;
        }

        private static long OptionalDepth(JsonElement node)
        {
            foreach (string field in new[] { "true_depth", "max_depth", "depth" })
            {
                if (node.TryGetProperty(field, out JsonElement value) &&
                    value.ValueKind == JsonValueKind.Number &&
                    value.TryGetInt64(out long depth) && depth >= 0)
                {
                    return depth;
                }
            }
            return 0;
        }

        private static string? OptionalString(
            JsonElement parent,
            string name)
        {
            if (!parent.TryGetProperty(name, out JsonElement value) ||
                value.ValueKind != JsonValueKind.String)
            {
                return null;
            }
            string? result = value.GetString();
            return string.IsNullOrWhiteSpace(result) ? null : result;
        }
    }

    private sealed record PreviousNode(
        string NodeId,
        string RegionId,
        long TrueDepth,
        PagesConformationPoint Intrinsic,
        PagesConformationPoint Aligned);

    private sealed record PreviousModel(
        IReadOnlyDictionary<string, PreviousNode> Nodes)
    {
        public static PreviousModel Read(ReadOnlySpan<byte> bytes)
        {
            using JsonDocument document = PagesStrictJson.Parse(
                bytes,
                "Previous Topology Atlas conformation");
            JsonElement root = document.RootElement;
            string schema = PagesStrictJson.RequiredString(
                root,
                "schema_version",
                "$previous");
            if (!StringComparer.Ordinal.Equals(
                    schema,
                    PagesConformationSchemas.Conformation))
            {
                throw new InvalidDataException(
                    "Previous conformation has an unsupported schema.");
            }
            JsonElement profile = PagesStrictJson.RequiredProperty(
                root,
                "layout_profile",
                JsonValueKind.Object,
                "$previous");
            string digest = PagesStrictJson.RequiredString(
                profile,
                "digest",
                "$previous.layout_profile");
            if (!StringComparer.Ordinal.Equals(
                    digest,
                    PagesTopologyAtlasConformationSchemas.LayoutProfileDigest))
            {
                throw new InvalidDataException(
                    "Previous conformation uses a different layout profile.");
            }
            JsonElement encoding = PagesStrictJson.RequiredProperty(
                root,
                "coordinate_encoding",
                JsonValueKind.Object,
                "$previous");
            if (!encoding.TryGetProperty("scale", out JsonElement scale) ||
                !scale.TryGetInt32(out int scaleValue) ||
                scaleValue != PagesTopologyAtlasConformationSchemas.CoordinateScale)
            {
                throw new InvalidDataException(
                    "Previous conformation uses a different coordinate scale.");
            }

            var nodes = new Dictionary<string, PreviousNode>(
                StringComparer.Ordinal);
            foreach (JsonElement value in PagesStrictJson.RequiredProperty(
                root,
                "nodes",
                JsonValueKind.Array,
                "$previous").EnumerateArray())
            {
                string id = PagesStrictJson.RequiredString(
                    value,
                    "node_id",
                    "$previous.nodes[]");
                var node = new PreviousNode(
                    id,
                    PagesStrictJson.RequiredString(
                        value,
                        "region_id",
                        $"$previous.nodes[{id}]"),
                    value.GetProperty("true_depth").GetInt64(),
                    ReadPoint(value.GetProperty("intrinsic")),
                    ReadPoint(value.GetProperty("aligned")));
                if (!nodes.TryAdd(id, node))
                {
                    throw new InvalidDataException(
                        $"Previous conformation contains duplicate node {id}.");
                }
            }
            return new PreviousModel(nodes);
        }

        private static PagesConformationPoint ReadPoint(JsonElement value) =>
            new(
                value.GetProperty("x").GetInt64(),
                value.GetProperty("y").GetInt64(),
                value.GetProperty("z").GetInt64());
    }
}
