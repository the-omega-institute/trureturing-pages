using Trureturing.Pages.Core;

return PagesCli.Run(args);

internal static class PagesCli
{
    public static int Run(string[] args)
    {
        try
        {
            return args.FirstOrDefault() switch
            {
                "project" => Project(args),
                "project-topology" => ProjectTopology(args),
                "delta" => Delta(args),
                _ => Usage()
            };
        }
        catch (Exception exception)
        {
            Console.Error.WriteLine(exception.Message);
            return 1;
        }
    }

    private static int Project(string[] args)
    {
        if (args.Length is < 3 or > 5)
        {
            return Usage();
        }

        PagesTruthReleasePort port =
            PagesPortJson.ReadTruthReleasePort(File.ReadAllBytes(args[1]));
        PagesIntuitionOverlay? overlay = args.Length >= 4 && args[3] != "-"
            ? PagesPortJson.ReadIntuitionOverlay(File.ReadAllBytes(args[3]), port)
            : null;
        int radius = args.Length == 5
            ? int.Parse(args[4], System.Globalization.CultureInfo.InvariantCulture)
            : 1;

        PagesDagArtifacts artifacts = PagesDagProjection.Build(port, overlay, radius);
        string outputDirectory = Path.GetFullPath(args[2]);
        Directory.CreateDirectory(outputDirectory);

        WriteAtomic(
            Path.Combine(outputDirectory, "root.json"),
            PagesPortJson.Write(artifacts.Root));

        foreach ((string relativePath, PagesDagNeighborhood neighborhood)
            in artifacts.Neighborhoods)
        {
            WriteAtomic(
                Path.Combine(outputDirectory, relativePath),
                PagesPortJson.Write(neighborhood));
        }

        Console.WriteLine(
            $"projected release {port.ReleaseDigest}: " +
            $"{artifacts.Root.Nodes.Count} nodes, {artifacts.Root.Edges.Count} edges");
        return 0;
    }

    private static int ProjectTopology(string[] args)
    {
        if (args.Length is < 3 or > 4)
        {
            return Usage();
        }

        byte[] topologyBytes = File.ReadAllBytes(args[1]);
        PagesCertifiedTopology topology =
            PagesCertifiedTopologyJson.Read(topologyBytes);

        PagesIntuitionOverlay? overlay = null;
        if (args.Length == 4 && args[3] != "-")
        {
            PagesTopologyIntuitionOverlay topologyOverlay =
                PagesTopologyIntuitionOverlayJson.Read(File.ReadAllBytes(args[3]));
            overlay = PagesTopologyIntuitionOverlayJson.Bind(
                topologyOverlay,
                topology,
                topologyBytes);
        }

        PagesCertifiedTopologyView view =
            PagesCertifiedTopologyProjection.Build(topology, overlay);

        WriteAtomic(Path.GetFullPath(args[2]), PagesCertifiedTopologyJson.Write(view));
        Console.WriteLine(
            $"projected certified topology {topology.SourceTruthReleaseDigest}: " +
            $"{view.Nodes.Count} nodes, {view.Counts.Edges} certified edges, " +
            $"{view.Counts.AdvisoryEdges} advisory edges");
        return 0;
    }

    private static int Delta(string[] args)
    {
        if (args.Length != 4)
        {
            return Usage();
        }

        PagesTruthReleasePort from =
            PagesPortJson.ReadTruthReleasePort(File.ReadAllBytes(args[1]));
        PagesTruthReleasePort to =
            PagesPortJson.ReadTruthReleasePort(File.ReadAllBytes(args[2]));
        PagesReleaseDelta delta = PagesDagProjection.Compare(from, to);
        WriteAtomic(Path.GetFullPath(args[3]), PagesPortJson.Write(delta));
        return 0;
    }

    private static void WriteAtomic(string path, byte[] bytes)
    {
        string? directory = Path.GetDirectoryName(path);
        if (!string.IsNullOrEmpty(directory))
        {
            Directory.CreateDirectory(directory);
        }

        string temporary = path + $".tmp-{Guid.NewGuid():N}";
        try
        {
            File.WriteAllBytes(temporary, bytes);
            File.Move(temporary, path, overwrite: true);
        }
        finally
        {
            if (File.Exists(temporary))
            {
                File.Delete(temporary);
            }
        }
    }

    private static int Usage()
    {
        Console.Error.WriteLine(
            "usage:\n" +
            "  Trureturing.Pages.Cli project <pages-truth-release-port.json> " +
            "<output-dir> [<intuition-overlay.json>|-] [radius]\n" +
            "  Trureturing.Pages.Cli project-topology <certified-topology.json> " +
            "<output.json> [<topology-intuition-overlay.json>|-]\n" +
            "  Trureturing.Pages.Cli delta <old-port.json> <new-port.json> <output.json>");
        return 2;
    }
}
