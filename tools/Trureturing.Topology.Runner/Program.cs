using Trureturing.Topology;

if (args.Length != 5)
{
    Console.Error.WriteLine(
        "usage: Trureturing.Topology.Runner <truth-graph.json> " +
        "<truth-release-digest> <algorithm-profile.json> <producer-commit> <output.json>");
    return 2;
}

try
{
    await using FileStream graphStream = File.OpenRead(args[0]);
    TruthGraph graph = new StrataLintTruthGraphReader().Read(graphStream);
    byte[] profile = await File.ReadAllBytesAsync(args[2]);
    TopologyBindings bindings = TopologyBindings.FromAlgorithmProfile(
        args[1],
        profile,
        args[3]);
    CertifiedTopology topology = new TopologyCalculator().Compute(graph, bindings);
    byte[] output = CertifiedTopologySerializer.SerializeToUtf8Bytes(topology);

    string destination = Path.GetFullPath(args[4]);
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

    Console.WriteLine(
        $"certified {topology.Nodes.Count} topology nodes for {topology.TruthReleaseDigest}");
    return 0;
}
catch (Exception exception)
{
    Console.Error.WriteLine(exception.Message);
    return 1;
}
