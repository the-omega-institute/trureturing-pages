using Trureturing.Topology;

return await RunAsync(args);

static async Task<int> RunAsync(string[] arguments)
{
    try
    {
        if (arguments.FirstOrDefault() == "atlas")
        {
            return await ProduceAtlasAsync(arguments[1..]);
        }

        if (arguments.FirstOrDefault() == "certified")
        {
            return await ProduceCertifiedAsync(arguments[1..]);
        }

        return await ProduceCertifiedAsync(arguments);
    }
    catch (Exception exception)
    {
        Console.Error.WriteLine(exception.Message);
        return 1;
    }
}

static async Task<int> ProduceCertifiedAsync(string[] arguments)
{
    if (arguments.Length != 5)
    {
        return Usage();
    }

    await using FileStream graphStream = File.OpenRead(arguments[0]);
    TruthGraph graph = new StrataLintTruthGraphReader().Read(graphStream);
    byte[] profileBytes = await File.ReadAllBytesAsync(arguments[2]);
    TopologyBindings bindings = TopologyBindings.FromAlgorithmProfile(
        arguments[1],
        profileBytes,
        arguments[3]);
    CertifiedTopology topology = new TopologyCalculator().Compute(graph, bindings);
    byte[] output = CertifiedTopologySerializer.SerializeToUtf8Bytes(topology);
    await WriteAtomicAsync(arguments[4], output);

    Console.WriteLine(
        $"certified {topology.Nodes.Count} topology nodes for {topology.TruthReleaseDigest}");
    return 0;
}

static async Task<int> ProduceAtlasAsync(string[] arguments)
{
    if (arguments.Length != 6)
    {
        return Usage();
    }

    await using FileStream graphStream = File.OpenRead(arguments[0]);
    TruthGraph graph = new StrataLintTruthGraphReader().Read(graphStream);
    byte[] certifiedProfileBytes = await File.ReadAllBytesAsync(arguments[2]);
    byte[] atlasProfileBytes = await File.ReadAllBytesAsync(arguments[3]);

    TopologyBindings certifiedBindings = TopologyBindings.FromAlgorithmProfile(
        arguments[1],
        certifiedProfileBytes,
        arguments[4]);
    CertifiedTopology certified = new TopologyCalculator().Compute(
        graph,
        certifiedBindings);
    byte[] certifiedBytes = CertifiedTopologySerializer.SerializeToUtf8Bytes(certified);

    TopologyBindings atlasBindings = TopologyBindings.FromAlgorithmProfile(
        arguments[1],
        atlasProfileBytes,
        arguments[4]);
    TopologyAtlasProfile atlasProfile = TopologyAtlasProfileReader.Read(
        atlasProfileBytes);
    TopologyAtlas atlas = new TopologyAtlasCalculator().Compute(
        graph,
        certified,
        certifiedBytes,
        atlasBindings,
        atlasProfile);
    byte[] output = TopologyAtlasSerializer.SerializeToUtf8Bytes(atlas);
    await WriteAtomicAsync(arguments[5], output);

    Console.WriteLine(
        $"derived {atlas.Clusters.Count} clusters and " +
        $"{atlas.StructuralAffinities.Count} affinities for {atlas.TruthReleaseDigest}");
    return 0;
}

static async Task WriteAtomicAsync(string path, byte[] output)
{
    string destination = Path.GetFullPath(path);
    Directory.CreateDirectory(Path.GetDirectoryName(destination)!);
    string temporary = destination + $".tmp-{Guid.NewGuid():N}";
    try
    {
        await File.WriteAllBytesAsync(temporary, output);
        File.Move(temporary, destination, overwrite: true);
    }
    finally
    {
        if (File.Exists(temporary))
        {
            File.Delete(temporary);
        }
    }
}

static int Usage()
{
    Console.Error.WriteLine(
        "usage:\n" +
        "  Trureturing.Topology.Runner [certified] <truth-graph.json> " +
        "<truth-release-digest> <certified-profile.json> <producer-commit> <output.json>\n" +
        "  Trureturing.Topology.Runner atlas <truth-graph.json> " +
        "<truth-release-digest> <certified-profile.json> <atlas-profile.json> " +
        "<producer-commit> <output.json>");
    return 2;
}
